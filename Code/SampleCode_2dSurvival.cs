// =============================================================================
// 본 샘플 코드는 사이드 프로젝트인 2D 서바이벌 게임의 인게임 일부를 발췌한 코드입니다.
// RunDirector를 통해 런 생명주기와 주요 상태 전이를 조율하고, NightWaveSpawner에서 데이터 기반 웨이브 스폰과 난이도 폴백을 처리하도록 구성했습니다.
// 또한 오브젝트 풀링, 스폰 위치 검증, 코루틴 중단 가드 등을 적용해 모바일 환경에서의 안정성과 성능을 함께 고려했습니다.
// 핵심 플레이 흐름을 구조적으로 관리하는 방식과, 실제 런타임 문제를 해결한 방식을 보여드리고자 본 코드를 제출합니다.
// =============================================================================
// 게임 유형  : 2D 탑다운 서바이벌 (낮/밤 사이클 + 웨이브 디펜스)
//
// 포함된 시스템:
//   [1] RunDirector        — 런 생명주기 오케스트레이터
//                            (맵 생성, 캐러밴/플레이어 스폰, 상태 전이, GameOver/부활 처리)
//   [2] NightWaveSpawner   — 데이터 기반 야간 웨이브 스폰 시스템
//                            (링 샘플링, 장애물 검증, 폴백 & 난이도 스케일링)
//   [3] EventManager       — Action 기반 전역 이벤트 브로커 (참고용)
//
// 보조 타입:
//   EMonsterType           — WaveData(얼마나) + MonsterData(스탯)를 연결하는 스폰 타입 열거형
//
// 아키텍처 특징:
//   - Director 패턴    : RunDirector 가 서브시스템을 직접 결합하지 않고 조율
//   - 이벤트 기반      : EventManager 델리게이트로 GameOver / DeathPending 분리
//   - 데이터 기반      : 모든 튜닝 값은 GameConfig / WaveData(ScriptableObject)에 위치
//   - 풀 기반 스폰     : 야간 웨이브는 ObjectManager → PoolManager 파이프라인을 통해 스폰되어
//                        런타임 GC 부하를 최소화한다 (모바일 최적화)
//   - 코루틴 안전성    : _currentDay 가드로 날짜 전환 시 스테일 코루틴을 즉시 중단하며,
//                        날짜 누락 시 이전 WaveData 를 클론·스케일링해 난이도 연속성을 보장한다
//   - 씬 탐색 전략     : 초기화 단계에서 참조를 캐시하고, 런타임 FindAnyObjectByType 은
//                        씬 전환·복구 안정성이 필요한 경로에만 한정 사용한다
//
// RunDirector 상태 전이:
//   NotStarted     -> StartRun()                       -> IsRunActive = true
//   IsRunActive    -> HandleGameOver()                 -> _isGameOver = true,  IsRunActive = false
//   IsRunActive    -> HandlePlayerDeathPending()       -> _isDeathPending = true  (런 유지, 시간 동결)
//   DeathPending   -> ResumeFromGameOver()             -> 플래그 초기화, IsRunActive = true 복원
//   IsRunActive    -> EndRun()                         -> 모든 플래그 초기화, IsRunActive = false
// =============================================================================

using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

// WaveData 는 '얼마나' 스폰할지, MonsterData 는 '스탯'을 정의한다.
// EMonsterType 은 두 데이터를 연결하는 키 역할을 하며 string 리터럴 비교를 제거한다.
public enum EMonsterType { Monster, Elite, Boss }

#region [1] RunDirector — 런 생명주기 오케스트레이터

/// <summary>
/// 단일 런의 생명주기를 총괄한다.
/// 맵 생성 → 캐러밴/플레이어 스폰 → DayNightCycle 이벤트 바인딩 →
/// GameOver / 부활 전환까지 모든 흐름을 조율한다.
/// </summary>
public class RunDirector : MonoBehaviour
{
    #region 필드

    public bool    IsRunActive     { get; private set; }
    public Caravan CaravanInstance { get; private set; }

    private int              _seedUsed;
    private NightWaveSpawner _nightWaveSpawner;
    private DayNightCycle    _dayNightCycle;
    private MapGenerator     _mapGenerator;
    private ResourceDirector _resourceDirector;
    private bool             _isGameOver;
    private bool             _isDeathPending;
    private bool             _caravanSpawned;

    #endregion

    #region Unity 생명주기

    public virtual void Awake()
    {
        EnsureDataLoaded();
        EnsureNightWaveSpawner();
        EnsureDayNightBindings();

        if (EventManager.Instance != null)
        {
            // 중복 구독 방지를 위해 Remove → Add 순으로 등록
            EventManager.Instance.RemoveEvent(Define.EEventType.GameOver,           HandleGameOver);
            EventManager.Instance.AddEvent   (Define.EEventType.GameOver,           HandleGameOver);
            EventManager.Instance.RemoveEvent(Define.EEventType.PlayerDeathPending, HandlePlayerDeathPending);
            EventManager.Instance.AddEvent   (Define.EEventType.PlayerDeathPending, HandlePlayerDeathPending);
        }
    }

    public virtual void OnDestroy()
    {
        if (EventManager.Instance != null)
        {
            EventManager.Instance.RemoveEvent(Define.EEventType.GameOver,           HandleGameOver);
            EventManager.Instance.RemoveEvent(Define.EEventType.PlayerDeathPending, HandlePlayerDeathPending);
        }
    }

    #endregion

    #region 공개 API

    /// <summary>RunDirector 싱글톤 GameObject를 생성하거나 기존 인스턴스를 반환한다.</summary>
    public static RunDirector Ensure()
    {
        RunDirector existing = FindAnyObjectByType<RunDirector>(FindObjectsInactive.Include);
        if (existing != null)
        {
            return existing;
        }

        GameObject go = new GameObject("@RunDirector");
        return go.AddComponent<RunDirector>();
    }

    /// <summary>
    /// GameManager.StartRun() 이 호출하는 런 시작 진입점.
    /// 맵 생성 → 캐러밴/플레이어 스폰 → 리소스 스폰 순으로 진행한다.
    /// </summary>
    public void StartRun()
    {
        if (_isGameOver || IsRunActive)
        {
            Debug.Log("RunDirector: StartRun 무시 (게임 오버 또는 이미 활성 상태).");
            return;
        }

        if (EnsureDataLoaded() == false)
        {
            return;
        }

        EnsureDayNightBindings();

        GameConfig.RunSettings cfg = DataManager.Instance.GameConfig.Run;

        _seedUsed = cfg.Seed != 0 ? cfg.Seed : System.Environment.TickCount;
        UnityEngine.Random.InitState(_seedUsed);

        bool spawnCaravanNow = cfg.CaravanSpawnDayIndex <= 1;

        // 초기화 시점 1회 탐색 후 _mapGenerator 에 캐시 — 이후 런타임에서는 재탐색하지 않는다
        _mapGenerator = FindAnyObjectByType<MapGenerator>(FindObjectsInactive.Include);
        if (_mapGenerator != null)
        {
            if (_mapGenerator.GenerateMap(_seedUsed))
            {
                if (spawnCaravanNow)
                {
                    SpawnCaravan(cfg);
                    if (CaravanInstance != null)
                    {
                        CaravanInstance.transform.position = _mapGenerator.CaravanWorldPos;
                    }
                }

                EnsurePlayer();
                if (GameManager.Instance != null && GameManager.Instance.Player != null)
                {
                    GameManager.Instance.Player.transform.position = _mapGenerator.PlayerStartWorldPos;
                }

                _resourceDirector = ResourceDirector.Ensure();
                _resourceDirector.InitialSpawn(_mapGenerator);
            }
            else
            {
                Debug.LogWarning("RunDirector: MapGenerator 실패 — 원점 스폰으로 폴백.");
                if (spawnCaravanNow) { SpawnCaravan(cfg); }
                EnsurePlayer();
            }
        }
        else
        {
            if (spawnCaravanNow) { SpawnCaravan(cfg); }
            EnsurePlayer();
        }

        EnsureNightWaveSpawner();
        if (_nightWaveSpawner != null && CaravanInstance != null)
        {
            _nightWaveSpawner.CaravanTransform = CaravanInstance.transform;
        }

        IsRunActive = true;
        Debug.Log($"RunDirector: StartRun 완료. Seed={_seedUsed}, " +
                  $"Player={(GameManager.Instance?.Player != null ? GameManager.Instance.Player.name : "null")}, " +
                  $"Caravan={(CaravanInstance != null ? CaravanInstance.name : "null")}");
    }

    /// <summary>
    /// 씬 이동 또는 타이틀 복귀 시 호출하는 런 완전 종료 진입점.
    /// 모든 상태 플래그를 초기값으로 되돌려 다음 StartRun() 을 안전하게 허용한다.
    /// </summary>
    public void EndRun()
    {
        _isGameOver     = false;
        _isDeathPending = false;
        _caravanSpawned = false;
        IsRunActive     = false;   // 상태 전이: 런 종료 → NotStarted
        Time.timeScale  = 1f;

        _nightWaveSpawner?.StopAndReset();
        _dayNightCycle?.StopCycle();

        Debug.Log("RunDirector: 런 종료 — 모든 상태 초기화.");
    }

    /// <summary>부활 광고/다이아 이후 런을 재개한다. timeScale 복원 및 DayNightCycle 재시작.</summary>
    public void ResumeFromGameOver()
    {
        if (_isDeathPending == false && _isGameOver == false)
        {
            return;
        }

        _isDeathPending = false;
        _isGameOver     = false;
        IsRunActive     = true;   // 상태 전이: 부활 → IsRunActive 복원
        Time.timeScale  = 1f;

        _nightWaveSpawner?.ResumeFromGameOver();   // _currentDay 초기화 — 다음 밤 스폰 준비

        _dayNightCycle = DayNightCycle.Ensure();
        if (_dayNightCycle != null)
        {
            _dayNightCycle.StartCycle();
        }

        Debug.Log("RunDirector: 부활 후 재개.");
    }

    #endregion

    #region 낮/밤 이벤트 핸들러

    private void HandleNightStarted(int day)
    {
        if (_isGameOver)
        {
            return;
        }

        // DevTuning 플래그로 QA 단계에서 야간 스폰을 코드 수정 없이 비활성화 가능
        GameConfig cfg = GameManager.Instance != null ? GameManager.Instance.Config : null;
        if (cfg != null && cfg.DevTuning != null && cfg.DevTuning.DisableNightWaveSpawning)
        {
            Debug.Log("RunDirector: 야간 웨이브 스폰 스킵 (DevTuning).");
            return;
        }

        EnsureNightWaveSpawner();
        if (_nightWaveSpawner == null)
        {
            return;
        }

        // 캐러밴 우선, 초반 날은 플레이어 위치로 폴백
        if (CaravanInstance != null)
        {
            _nightWaveSpawner.CaravanTransform = CaravanInstance.transform;
        }
        else if (GameManager.Instance != null && GameManager.Instance.Player != null)
        {
            _nightWaveSpawner.CaravanTransform = GameManager.Instance.Player.transform;
        }

        _nightWaveSpawner.StartNight(day);
    }

    private void HandleDayStarted(int day)
    {
        if (_isGameOver)
        {
            return;
        }

        if (_caravanSpawned == false)
        {
            GameConfig.RunSettings runCfg = DataManager.Instance?.GameConfig?.Run;
            int spawnDay = runCfg != null ? runCfg.CaravanSpawnDayIndex : 1;

            if (day >= spawnDay)
            {
                SpawnCaravan(runCfg);

                if (CaravanInstance != null && _mapGenerator != null && _mapGenerator.IsGenerated)
                {
                    CaravanInstance.transform.position = _mapGenerator.CaravanWorldPos;
                }

                if (_nightWaveSpawner != null && CaravanInstance != null)
                {
                    _nightWaveSpawner.CaravanTransform = CaravanInstance.transform;
                }

                Debug.Log($"RunDirector: day={day}에 캐러밴 스폰.");
            }
        }

        _nightWaveSpawner?.OnDayStarted(day);
    }

    #endregion

    #region GameOver / DeathPending 핸들러

    /// <summary>
    /// 캐러밴 파괴 시 호출. 모든 스폰·사이클을 중단하고 GameOver 팝업을 표시한다.
    /// _isGameOver = true 로 런을 잠그며, 재시작은 EndRun() 호출 이후에만 허용된다.
    /// </summary>
    private void HandleGameOver()
    {
        if (_isGameOver)
        {
            return;
        }

        _isGameOver  = true;
        IsRunActive  = false;   // 상태 전이: IsRunActive → false

        // Awake 이후 동적 생성된 서브시스템 대비 — GameOver 경로는 비빈번이므로 탐색 비용 허용
        if (_nightWaveSpawner == null)
        {
            _nightWaveSpawner = FindAnyObjectByType<NightWaveSpawner>(FindObjectsInactive.Include);
        }

        _nightWaveSpawner?.OnGameOver();

        if (_resourceDirector == null)
        {
            _resourceDirector = FindAnyObjectByType<ResourceDirector>(FindObjectsInactive.Include);
        }

        _resourceDirector?.OnGameOver();

        _dayNightCycle = DayNightCycle.Ensure();
        _dayNightCycle?.StopCycle();

        UIManager.Instance?.ShowPopupUI<UI_GameOverPopup>();

        Debug.Log("RunDirector: GameOver 처리 완료.");
    }

    /// <summary>
    /// 플레이어 HP 0 시 호출. Time.timeScale = 0 으로 모든 코루틴·물리를 일시정지한다.
    /// DayNightCycle 은 내부 플래그가 독립적이므로 명시적으로 중지한다.
    /// </summary>
    private void HandlePlayerDeathPending()
    {
        _isDeathPending = true;
        Time.timeScale  = 0f;

        _dayNightCycle = DayNightCycle.Ensure();
        _dayNightCycle?.StopCycle();

        UIManager.Instance?.ShowPopupUI<UI_GameOverPopup>();

        Debug.Log("RunDirector: PlayerDeathPending — 시간 동결, 부활 팝업 표시.");
    }

    #endregion

    #region 비공개 헬퍼

    private void EnsureNightWaveSpawner()
    {
        if (_nightWaveSpawner == null)
        {
            _nightWaveSpawner = NightWaveSpawner.Ensure();
        }
    }

    private void EnsureDayNightBindings()
    {
        _dayNightCycle = DayNightCycle.Ensure();
        if (_dayNightCycle == null)
        {
            return;
        }

        _dayNightCycle.OnNightStarted -= HandleNightStarted;
        _dayNightCycle.OnDayStarted   -= HandleDayStarted;
        _dayNightCycle.OnNightStarted += HandleNightStarted;
        _dayNightCycle.OnDayStarted   += HandleDayStarted;
    }

    /// <summary>이번 런의 캐러밴을 스폰하거나 씬에 배치된 기존 캐러밴을 재활용한다.</summary>
    private void SpawnCaravan(GameConfig.RunSettings cfg)
    {
        if (_isGameOver || _caravanSpawned)
        {
            return;
        }

        Caravan existing = FindAnyObjectByType<Caravan>(FindObjectsInactive.Include);
        CaravanInstance = existing != null ? existing : ObjectManager.Instance.SpawnCaravan(cfg?.CaravanPrefabKey);

        if (CaravanInstance != null)
        {
            Health health = CaravanInstance.GetComponent<Health>();
            if (health == null)
            {
                health = CaravanInstance.gameObject.AddComponent<Health>();
            }

            int maxHp = (cfg != null && cfg.CaravanMaxHp > 0) ? cfg.CaravanMaxHp : 1000;
            health.SetHp(maxHp, maxHp);
            _caravanSpawned = true;
        }
    }

    /// <summary>씬 배치 → ObjectManager 스폰 순으로 플레이어를 확보하고 레벨·템플릿을 적용한다.</summary>
    private void EnsurePlayer()
    {
        if (GameManager.Instance == null)
        {
            return;
        }

        if (GameManager.Instance.Player == null)
        {
            Player existing = FindAnyObjectByType<Player>(FindObjectsInactive.Include);
            GameManager.Instance.Player = existing != null
                ? existing
                : ObjectManager.Instance?.SpawnPlayer("Player", false);
        }

        if (GameManager.Instance.Player == null)
        {
            return;
        }

        // 레벨 비례 HP 적용
        Health health = GameManager.Instance.Player.GetComponent<Health>();
        if (health == null)
        {
            health = GameManager.Instance.Player.gameObject.AddComponent<Health>();
        }

        int level = Mathf.Max(1, GameManager.Instance.Level);
        int maxHp = Mathf.Max(1, 100 + (level - 1) * 10);
        health.SetHp(maxHp, maxHp);

        // 선택된 캐릭터 템플릿 적용
        string templateId = GameManager.Instance.SelectedCharacterId;
        if (string.IsNullOrEmpty(templateId) == false)
        {
            PlayerData pd = GameManager.Instance.GetPlayerData(templateId);
            GameManager.Instance.Player.ApplyPlayerTemplate(pd, ResolveStartingItems(pd));
        }
    }

    /// <summary>
    /// PlayerData 에서 시작 아이템 목록을 해석한다.
    /// 우선순위: 아이템 ID 직접 참조 → 이름 기반 룩업.
    /// </summary>
    private List<KeyValuePair<int, int>> ResolveStartingItems(PlayerData pd)
    {
        if (pd == null)
        {
            return null;
        }

        List<KeyValuePair<int, int>> result = new List<KeyValuePair<int, int>>();

        // 우선순위 1: 시작 아이템 ID 직접 목록 (DataManager 에서 바로 조회)
        if (pd.StartingItemIds != null && pd.StartingItemIds.Count > 0)
        {
            for (int i = 0; i < pd.StartingItemIds.Count; i++)
            {
                int count = (pd.StartingItemCounts != null && i < pd.StartingItemCounts.Count)
                    ? pd.StartingItemCounts[i] : 1;

                result.Add(new KeyValuePair<int, int>(pd.StartingItemIds[i], count));
            }

            return result;
        }

        // 우선순위 2: 이름 기반 룩업 (기획 시트에서 이름으로 지정하는 경우의 폴백)
        if (pd.StartingItemNames == null
            || DataManager.Instance == null
            || DataManager.Instance.ItemDict == null)
        {
            return result;
        }

        for (int i = 0; i < pd.StartingItemNames.Count; i++)
        {
            string itemName = pd.StartingItemNames[i];
            int count = (pd.StartingItemCounts != null && i < pd.StartingItemCounts.Count)
                ? pd.StartingItemCounts[i] : 1;

            foreach (var kv in DataManager.Instance.ItemDict)
            {
                ItemData idata = kv.Value;
                if (idata == null) { continue; }

                if (string.Equals(idata.NameTextID,   itemName, StringComparison.OrdinalIgnoreCase)
                 || string.Equals(idata.IconSpriteKey, itemName, StringComparison.OrdinalIgnoreCase))
                {
                    result.Add(new KeyValuePair<int, int>(kv.Key, count));
                    break;
                }
            }
        }

        return result;
    }

    /// <summary>DataManager 및 GameConfig 가용성을 검증한다. 필요 시 LoadData() 를 호출한다.</summary>
    private bool EnsureDataLoaded()
    {
        if (DataManager.Instance == null)
        {
            Debug.LogError("RunDirector: DataManager.Instance가 null.");
            return false;
        }

        if (DataManager.Instance.GameConfig == null)
        {
            DataManager.Instance.LoadData();
        }

        if (DataManager.Instance.GameConfig == null)
        {
            Debug.LogError("RunDirector: GameConfig를 로드할 수 없음.");
            return false;
        }

        return true;
    }

    #endregion
}

#endregion

#region [2] NightWaveSpawner — 데이터 기반 야간 웨이브 스폰 시스템

/// <summary>
/// WaveData 를 기반으로 밤마다 Monster / Elite / Boss 그룹을 스폰한다.
/// 링 샘플링 + 장애물 검증으로 위치를 결정하고, 누락된 날짜는
/// 이전 WaveData 를 클론·스케일링하여 난이도가 끊기지 않도록 보장한다.
///
/// 최적화: 야간 웨이브는 풀링 기반 ObjectManager 를 통해 스폰되며,
/// 날짜 전환 시 _currentDay 가드로 스테일 코루틴을 즉시 중단한다.
/// 맵 경계는 호출당 1회만 캐시해 빈번한 씬 탐색 비용을 제거했다.
/// </summary>
public class NightWaveSpawner : MonoBehaviour
{
    #region 인스펙터 설정

    [Header("스폰 기준점")]
    [SerializeField] private Transform _caravanTransform;

    [Header("링 스폰 설정")]
    [SerializeField] private float _minSpawnRadius    = 5f;
    [SerializeField] private float _maxSpawnRadius    = 10f;
    [SerializeField] private float _spawnRingThickness = 6f;   // maxRadius = minRadius + thickness

    [Header("위치 검증")]
    [SerializeField] private LayerMask _obstacleMask;
    [SerializeField] private float _obstacleCheckRadius = 0.3f;
    [SerializeField] private int   _maxPositionTries    = 12;

    [Header("폴백")]
    [SerializeField] private Vector2 _fallbackOffset = new Vector2(6f, 0f);

    #endregion

    #region 비공개 상태

    private readonly List<Coroutine> _runningCoroutines = new List<Coroutine>();
    private readonly List<Monster>   _spawnedThisNight  = new List<Monster>();

    // 코루틴 스테일 가드: _currentDay 와 다르면 즉시 종료
    private int _currentDay = -1;

    // StartNight() 첫 호출 시 1회 캐시 — 이후 SampleSpawnPositionWithRetry() 에서 재탐색하지 않는다
    private MapGenerator _cachedMapGenerator;

    #endregion

    #region 공개 API

    public Transform CaravanTransform
    {
        get { return _caravanTransform; }
        set { _caravanTransform = value; }
    }

    /// <summary>NightWaveSpawner 싱글톤 GameObject를 생성하거나 기존 인스턴스를 반환한다.</summary>
    public static NightWaveSpawner Ensure()
    {
        NightWaveSpawner existing = FindAnyObjectByType<NightWaveSpawner>(FindObjectsInactive.Include);
        if (existing != null)
        {
            return existing;
        }

        GameObject go = new GameObject("@NightWaveSpawner");
        return go.AddComponent<NightWaveSpawner>();
    }

    #endregion

    #region Unity 생명주기

    public virtual void Awake()
    {
        // 단일 진실 공급원 유지: 최소 반경을 GameConfig 에서 읽어 적용
        if (GameManager.Instance?.Config?.Run != null)
        {
            float configMin = GameManager.Instance.Config.Run.MinDistanceFromCaravan;
            if (configMin > 0f)
            {
                _minSpawnRadius = configMin;
            }
        }

        _spawnRingThickness = Mathf.Max(0f, _spawnRingThickness);
        _maxSpawnRadius     = _minSpawnRadius + _spawnRingThickness;
        _minSpawnRadius     = Mathf.Max(0f, _minSpawnRadius);
        _maxSpawnRadius     = Mathf.Max(_minSpawnRadius, _maxSpawnRadius);
        _maxPositionTries   = Mathf.Max(1, _maxPositionTries);
    }

    #endregion

    #region 공개 진입점

    /// <summary>
    /// 지정 날짜의 야간 웨이브를 시작한다.
    /// WaveData 해석(폴백 + 스케일링 포함) 후 타입별 스폰 코루틴을 구동한다.
    /// </summary>
    public void StartNight(int day)
    {
        _currentDay = day;
        StopAllSpawning();
        _spawnedThisNight.Clear();

        // 맵 경계 참조를 이 시점에 캐시 — 스폰 위치 샘플링 루프에서 재탐색하지 않는다
        if (_cachedMapGenerator == null)
        {
            _cachedMapGenerator = FindAnyObjectByType<MapGenerator>(FindObjectsInactive.Include);
        }

        if (DataManager.Instance == null || DataManager.Instance.WaveDict == null)
        {
            Debug.LogWarning("NightWaveSpawner: DataManager 또는 WaveDict null. 스폰 스킵.");
            return;
        }

        WaveData wave;
        int usedDay, gap;
        if (TryResolveWaveOrFallback(day, out wave, out usedDay, out gap) == false || wave == null)
        {
            Debug.LogWarning($"NightWaveSpawner: day={day} WaveData 없음 (폴백 포함). 스킵.");
            return;
        }

        if (usedDay != day)
        {
            Debug.Log($"NightWaveSpawner: day={day} 요청에 day={usedDay} 폴백 사용 (gap={gap}).");
        }

        float interval = wave.SpawnInterval > 0f ? wave.SpawnInterval : 0.5f;

        int started = 0;
        started += StartSpawnForTypeIfAny(day, EMonsterType.Monster, wave.MonsterCount, wave.SpawnDelay, interval);
        started += StartSpawnForTypeIfAny(day, EMonsterType.Elite,   wave.EliteCount,   wave.SpawnDelay, interval);
        started += StartSpawnForTypeIfAny(day, EMonsterType.Boss,    wave.BossCount,    wave.SpawnDelay, interval);

        if (started == 0)
        {
            Debug.LogWarning($"NightWaveSpawner: day={day} 모든 카운트 0. 스킵.");
            return;
        }

        Debug.Log($"NightWaveSpawner: Night={day} 시작. 코루틴={started}, " +
                  $"Interval={interval:0.##}s M={wave.MonsterCount} E={wave.EliteCount} B={wave.BossCount}");
    }

    /// <summary>낮 시작 시 호출. 남은 스폰을 취소하고 이번 밤 몬스터를 전부 강제 회수한다.</summary>
    public void OnDayStarted(int day)
    {
        // day 는 현재 미사용 — DayNightCycle 이벤트 시그니처와 맞추기 위해 유지
        // (향후 낮 번호에 따른 보상·이벤트 분기에 활용 가능)
        StopAllSpawning();
        ForceKillSpawned();
    }

    /// <summary>게임 오버 시 호출. 스폰만 중단하며 이미 스폰된 몬스터는 연출을 위해 유지한다.</summary>
    public void OnGameOver()
    {
        StopAllSpawning();
        _currentDay = -1;
    }

    /// <summary>
    /// 런 완전 종료(EndRun) 시 호출. 스폰 중단 + 스폰된 몬스터 전부 회수 + 캐시 초기화.
    /// OnGameOver 와 달리 씬 전환 전 완전한 정리가 목적이다.
    /// </summary>
    public void StopAndReset()
    {
        StopAllSpawning();
        ForceKillSpawned();
        _currentDay         = -1;
        _cachedMapGenerator = null;   // 씬 전환 후 재사용을 위해 캐시 해제
    }

    /// <summary>부활 후 재사용을 위해 내부 상태를 초기화한다.</summary>
    public void ResumeFromGameOver()
    {
        _currentDay = -1;
    }

    #endregion

    #region 스폰 오케스트레이션

    private int StartSpawnForTypeIfAny(int day, EMonsterType type, int count, float delay, float interval)
    {
        if (count <= 0)
        {
            return 0;
        }

        Coroutine co = StartCoroutine(SpawnRoutine(day, type, delay, interval, count));
        _runningCoroutines.Add(co);
        return 1;
    }

    private void StopAllSpawning()
    {
        for (int i = 0; i < _runningCoroutines.Count; i++)
        {
            if (_runningCoroutines[i] != null)
            {
                StopCoroutine(_runningCoroutines[i]);
            }
        }

        _runningCoroutines.Clear();
    }

    private void ForceKillSpawned()
    {
        for (int i = _spawnedThisNight.Count - 1; i >= 0; i--)
        {
            Monster m = _spawnedThisNight[i];
            _spawnedThisNight.RemoveAt(i);

            if (m == null || m.gameObject.activeInHierarchy == false)
            {
                continue;  // 자연사로 이미 풀 반환된 몬스터는 스킵 (이중 해제 방지)
            }

            ObjectManager.Instance.Despawn(m);
        }

        _spawnedThisNight.Clear();
    }

    #endregion

    #region 스폰 코루틴

    /// <summary>
    /// count 개의 몬스터를 interval 간격으로 순차 스폰한다.
    /// _currentDay 가 변경되면 즉시 종료 (스테일 코루틴 가드).
    /// </summary>
    private IEnumerator SpawnRoutine(int day, EMonsterType type, float firstOffset, float interval, int count)
    {
        if (firstOffset > 0f)
        {
            yield return new WaitForSeconds(firstOffset);
        }

        for (int i = 0; i < count; i++)
        {
            if (_currentDay != day)
            {
                yield break;
            }

            Monster spawned = TrySpawnOne(type);
            if (spawned != null)
            {
                _spawnedThisNight.Add(spawned);
                TryApplyWaveStats(spawned, type, day);
            }
            else
            {
                Debug.LogWarning($"NightWaveSpawner: 스폰 null — day={day}, type={type}");
            }

            if (i < count - 1)
            {
                yield return new WaitForSeconds(interval);
            }
        }
    }

    #endregion

    #region 몬스터 스탯 & 드롭 테이블 주입

    /// <summary>
    /// 스폰된 몬스터에 WaveData 기반 스탯과 드롭 테이블을 주입한다.
    /// 데이터 오류가 스폰 코루틴 전체를 중단하지 않도록 try-catch 로 보호한다.
    /// </summary>
    private void TryApplyWaveStats(Monster monster, EMonsterType type, int day)
    {
        try
        {
            WaveData resolvedWave;
            int usedDay, gap;
            if (TryResolveWaveOrFallback(day, out resolvedWave, out usedDay, out gap) == false
                || resolvedWave == null)
            {
                return;
            }

            // WaveData → 스폰 카운트/인터벌, MonsterData → 스탯. EMonsterType 이 두 데이터를 연결한다.
            ApplyMonsterStats(monster, type, resolvedWave.HpIncreaseRate);
            TryInjectDropTable(monster, type, resolvedWave);
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"NightWaveSpawner: 스탯/드롭 테이블 적용 실패 — {ex.Message}");
        }
    }

    /// <summary>MonsterData(기본 스탯)를 조회해 WaveData 의 HpIncreaseRate 로 스케일링 후 주입한다.</summary>
    private void ApplyMonsterStats(Monster monster, EMonsterType type, float hpScale)
    {
        if (DataManager.Instance == null || DataManager.Instance.MonsterDataDict == null)
        {
            return;
        }

        // enum.ToString() 이 MonsterData.PrefabKey 와 일치하도록 enum 이름을 맞춰 정의한다.
        string prefabKey = type.ToString();
        MonsterData data = null;
        foreach (MonsterData entry in DataManager.Instance.MonsterDataDict.Values)
        {
            if (entry.PrefabKey == prefabKey)
            {
                data = entry;
                break;
            }
        }

        if (data == null)
        {
            Debug.LogWarning($"NightWaveSpawner: '{prefabKey}' MonsterData 없음.");
            return;
        }

        int scaledHp = Mathf.RoundToInt(data.BaseHp * Mathf.Max(1f, hpScale));
        monster.SetData(data, scaledHp);
    }

    /// <summary>WaveData 의 드롭 테이블 ID 를 MonsterDropOnDeath 에 주입한다.</summary>
    private void TryInjectDropTable(Monster monster, EMonsterType type, WaveData wave)
    {
        int dropTableId = type switch
        {
            EMonsterType.Monster => wave.MonsterDropTableId,
            EMonsterType.Elite   => wave.EliteDropTableId,
            EMonsterType.Boss    => wave.BossDropTableId,
            _                    => 0,
        };

        if (dropTableId <= 0)
        {
            return;
        }

        MonsterDropOnDeath dropComponent = monster.GetComponent<MonsterDropOnDeath>();
        if (dropComponent != null)
        {
            dropComponent.SetDropTableId(dropTableId);
        }
    }

    #endregion

    #region 스폰 위치 샘플링

    /// <summary>
    /// 스폰 중심(캐러밴 → 플레이어 우선순위)에서 유효한 링 위치를 샘플링해 몬스터를 스폰한다.
    /// </summary>
    private Monster TrySpawnOne(EMonsterType type)
    {
        Vector2 spawnCenter;

        if (_caravanTransform != null)
        {
            spawnCenter = _caravanTransform.position;
        }
        else if (GameManager.Instance != null && GameManager.Instance.Player != null)
        {
            spawnCenter = GameManager.Instance.Player.transform.position;
        }
        else
        {
            Debug.LogWarning("NightWaveSpawner: 스폰 중심 결정 불가 (캐러밴·플레이어 모두 null).");
            return null;
        }

        // enum → string 은 ObjectManager 풀 키 조회에만 사용; 이후 비교는 불필요
        string prefabKey = type.ToString();
        Vector2 spawnPos = SampleSpawnPositionWithRetry(spawnCenter);

        Monster monster = null;
        try
        {
            monster = ObjectManager.Instance.SpawnMonster(prefabKey, false);
        }
        catch (Exception e)
        {
            Debug.LogWarning($"NightWaveSpawner: SpawnMonster('{prefabKey}') 예외 — {e.Message}");
            return null;
        }

        if (monster == null)
        {
            Debug.LogWarning($"NightWaveSpawner: '{prefabKey}' null 반환. 풀/어드레서블 설정 확인.");
            return null;
        }

        monster.transform.position = new Vector3(spawnPos.x, spawnPos.y, 0f);
        monster.SetAcquireRadius(_maxSpawnRadius + 5f);  // 링 외곽에서도 캐러밴 감지 보장

        return monster;
    }

    /// <summary>
    /// 링 내 무작위 위치를 최대 _maxPositionTries 회 샘플링한다.
    /// 맵 경계 + 장애물 겹침 검사를 통과한 첫 번째 위치를 반환한다.
    /// 모든 시도 실패 시 맵 경계 내로 클램핑된 폴백 오프셋을 반환한다.
    /// </summary>
    private Vector2 SampleSpawnPositionWithRetry(Vector2 center)
    {
        if (_maxSpawnRadius <= 0f)
        {
            return center + _fallbackOffset;
        }

        float minR = Mathf.Max(0f, _minSpawnRadius);
        float maxR = Mathf.Max(minR, _maxSpawnRadius);

        // StartNight() 에서 캐시된 참조를 사용 — 스폰 루프 중 씬 탐색 없음
        bool   hasBounds = false;
        Bounds mapBounds = new Bounds();
        if (_cachedMapGenerator != null && _cachedMapGenerator.IsGenerated)
        {
            Bounds b = _cachedMapGenerator.MapWorldBounds;
            if (b.size.sqrMagnitude > 0f)
            {
                mapBounds = b;
                hasBounds = true;
            }
        }

        for (int i = 0; i < _maxPositionTries; i++)
        {
            float   radius    = UnityEngine.Random.Range(minR, maxR);
            float   angle     = UnityEngine.Random.Range(0f, Mathf.PI * 2f);
            Vector2 candidate = center + new Vector2(Mathf.Cos(angle), Mathf.Sin(angle)) * radius;

            if (hasBounds && mapBounds.Contains(new Vector3(candidate.x, candidate.y, 0f)) == false)
            {
                continue;
            }

            if (IsSpawnPositionValid(candidate))
            {
                return candidate;
            }
        }

        Vector2 fallback = center + _fallbackOffset;
        if (hasBounds)
        {
            fallback = new Vector2(
                Mathf.Clamp(fallback.x, mapBounds.min.x, mapBounds.max.x),
                Mathf.Clamp(fallback.y, mapBounds.min.y, mapBounds.max.y));
        }

        return fallback;
    }

    private bool IsSpawnPositionValid(Vector2 pos)
    {
        if (_obstacleMask.value == 0)
        {
            return true;
        }

        return Physics2D.OverlapCircle(pos, _obstacleCheckRadius, _obstacleMask) == null;
    }

    #endregion

    #region 웨이브 폴백 & 스케일링

    /// <summary>
    /// 지정 날짜의 WaveData 를 해석한다.
    /// 해당 날짜 데이터가 없으면 MissingDayMaxGap 이내에서 가장 가까운 이전 날의
    /// WaveData 를 클론·스케일링해 난이도가 끊기지 않도록 한다.
    /// </summary>
    private bool TryResolveWaveOrFallback(int day, out WaveData outWave, out int usedDay, out int gap)
    {
        outWave = null;
        usedDay = day;
        gap     = 0;

        if (DataManager.Instance == null || DataManager.Instance.WaveDict == null)
        {
            return false;
        }

        WaveData wave;
        if (DataManager.Instance.WaveDict.TryGetValue(day, out wave) && wave != null)
        {
            outWave = wave;
            return true;
        }

        int maxGap = GameManager.Instance?.Config != null
            ? GameManager.Instance.Config.Run.MissingDayMaxGap
            : 10;

        for (int d = day - 1; d >= 1 && (day - d) <= maxGap; d--)
        {
            if (DataManager.Instance.WaveDict.TryGetValue(d, out wave) && wave != null)
            {
                usedDay = d;
                gap     = day - d;
                outWave = CloneWaveDataWithScaling(wave, gap);
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// baseWave 를 gap 에 비례하여 스케일링한 새 WaveData 를 반환한다.
    /// - 카운트 : 가산 방식 (+countMul × gap)
    /// - 인터벌 : 승산 방식 (×intervalMul ^ gap, 스폰 속도 점진 증가)
    /// 배율 값은 GameConfig 에서 읽어 기획자가 코드 수정 없이 튜닝 가능하다.
    /// </summary>
    private WaveData CloneWaveDataWithScaling(WaveData baseWave, int gap)
    {
        if (baseWave == null)
        {
            return null;
        }

        float countMulPerDay    = 0.05f;
        float intervalMulPerDay = 0.97f;
        if (GameManager.Instance?.Config != null)
        {
            countMulPerDay    = GameManager.Instance.Config.Run.MissingDaySpawnCountMultiplierPerDay;
            intervalMulPerDay = GameManager.Instance.Config.Run.MissingDaySpawnIntervalMultiplierPerDay;
        }

        float countMultiplier = 1f + countMulPerDay * gap;

        WaveData clone = new WaveData();
        clone.StageIndex         = baseWave.StageIndex;
        clone.WaveIndex          = baseWave.WaveIndex;
        clone.SpawnDelay         = baseWave.SpawnDelay;
        clone.HpIncreaseRate     = baseWave.HpIncreaseRate;
        clone.MonsterDropTableId = baseWave.MonsterDropTableId;
        clone.EliteDropTableId   = baseWave.EliteDropTableId;
        clone.BossDropTableId    = baseWave.BossDropTableId;

        clone.MonsterCount  = Mathf.Max(0, Mathf.CeilToInt(baseWave.MonsterCount * countMultiplier));
        clone.EliteCount    = Mathf.Max(0, Mathf.CeilToInt(baseWave.EliteCount   * countMultiplier));
        clone.BossCount     = Mathf.Max(0, Mathf.CeilToInt(baseWave.BossCount    * countMultiplier));
        clone.SpawnInterval = Mathf.Max(0.05f, baseWave.SpawnInterval * Mathf.Pow(intervalMulPerDay, gap));

        return clone;
    }

    #endregion
}

#endregion

#region [3] EventManager

public class EventManager : Singleton<EventManager>
{
    private readonly Dictionary<Define.EEventType, Action> _events
        = new Dictionary<Define.EEventType, Action>();

    /// <summary>이벤트 타입에 리스너를 등록한다. 키가 없으면 자동 생성.</summary>
    public void AddEvent(Define.EEventType eventType, Action listener)
    {
        if (_events.ContainsKey(eventType) == false)
        {
            _events.Add(eventType, null);
        }

        _events[eventType] += listener;
    }

    public void RemoveEvent(Define.EEventType eventType, Action listener)
    {
        if (_events.ContainsKey(eventType))
        {
            _events[eventType] -= listener;
        }
    }

    public void InvokeEvent(Define.EEventType eventType)
    {
        if (_events.ContainsKey(eventType))
        {
            _events[eventType]?.Invoke();
        }
    }

    public void Clear()
    {
        _events.Clear();
    }

    protected override void OnDestroy()
    {
        Clear();
        base.OnDestroy();
    }
}

#endregion