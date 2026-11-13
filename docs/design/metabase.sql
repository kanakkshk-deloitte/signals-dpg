-- Purple Dot Metabase dashboard query pack
-- Data source: PostgreSQL backing signals-dpg
-- Network default: purple_dot
--
-- Metabase variables used:
--   {{network_id}}   text (default: purple_dot)
--   {{domain}}       text (optional)
--   {{start_date}}   date (optional)
--   {{end_date}}     date (optional)
--
-- Domain IDs from network schema:
--   person_with_disability, service_provider, employer, ngo, government

/*
ROW 1, CARD A: Profiles created (total + last week trend)
Visualization: Number card
Main value: total_profiles
Trend value: wow_change_pct (week-over-week % change)
*/
WITH weekly AS (
  SELECT
    DATE_TRUNC('week', i.created_at)::date AS week_start,
    COUNT(*)::int AS profiles_created
  FROM items i
  WHERE i.item_network = {{network_id}}
    AND i.item_type = 'profile_1.0'
  [[ AND i.item_domain = {{domain}} ]]
  [[ AND i.created_at::date >= {{start_date}} ]]
  [[ AND i.created_at::date <= {{end_date}} ]]
  GROUP BY 1
),
ordered AS (
  SELECT
    week_start,
    profiles_created,
    ROW_NUMBER() OVER (ORDER BY week_start DESC) AS rn
  FROM weekly
),
totals AS (
  SELECT
    COUNT(*)::int AS total_profiles
  FROM items i
  WHERE i.item_network = {{network_id}}
    AND i.item_type = 'profile_1.0'
  [[ AND i.item_domain = {{domain}} ]]
  [[ AND i.created_at::date >= {{start_date}} ]]
  [[ AND i.created_at::date <= {{end_date}} ]]
)
SELECT
  t.total_profiles,
  COALESCE(MAX(CASE WHEN o.rn = 1 THEN o.profiles_created END), 0)::int AS last_week_profiles,
  COALESCE(MAX(CASE WHEN o.rn = 2 THEN o.profiles_created END), 0)::int AS prev_week_profiles,
  ROUND(
    (
      (
        COALESCE(MAX(CASE WHEN o.rn = 1 THEN o.profiles_created END), 0)::numeric
        - COALESCE(MAX(CASE WHEN o.rn = 2 THEN o.profiles_created END), 0)::numeric
      )
      / NULLIF(COALESCE(MAX(CASE WHEN o.rn = 2 THEN o.profiles_created END), 0)::numeric, 0)
    ) * 100.0,
    2
  ) AS wow_change_pct
FROM totals t
LEFT JOIN ordered o ON o.rn IN (1, 2)
GROUP BY t.total_profiles;

/*
ROW 1, CARD B: Total connections (total + last week trend)
Visualization: Number card
Main value: total_connections
Trend value: wow_change_pct (week-over-week % change)
*/
WITH weekly AS (
  SELECT
    DATE_TRUNC('week', a.created_at)::date AS week_start,
    COUNT(*)::int AS connections
  FROM item_actions a
  WHERE a.partition_network = {{network_id}}
    AND a.action_type = 'connect'
  [[ AND a.source_item_domain = {{domain}} ]]
  [[ AND a.created_at::date >= {{start_date}} ]]
  [[ AND a.created_at::date <= {{end_date}} ]]
  GROUP BY 1
),
ordered AS (
  SELECT
    week_start,
    connections,
    ROW_NUMBER() OVER (ORDER BY week_start DESC) AS rn
  FROM weekly
),
totals AS (
  SELECT
    COUNT(*)::int AS total_connections
  FROM item_actions a
  WHERE a.partition_network = {{network_id}}
    AND a.action_type = 'connect'
  [[ AND a.source_item_domain = {{domain}} ]]
  [[ AND a.created_at::date >= {{start_date}} ]]
  [[ AND a.created_at::date <= {{end_date}} ]]
)
SELECT
  t.total_connections,
  COALESCE(MAX(CASE WHEN o.rn = 1 THEN o.connections END), 0)::int AS last_week_connections,
  COALESCE(MAX(CASE WHEN o.rn = 2 THEN o.connections END), 0)::int AS prev_week_connections,
  ROUND(
    (
      (
        COALESCE(MAX(CASE WHEN o.rn = 1 THEN o.connections END), 0)::numeric
        - COALESCE(MAX(CASE WHEN o.rn = 2 THEN o.connections END), 0)::numeric
      )
      / NULLIF(COALESCE(MAX(CASE WHEN o.rn = 2 THEN o.connections END), 0)::numeric, 0)
    ) * 100.0,
    2
  ) AS wow_change_pct
FROM totals t
LEFT JOIN ordered o ON o.rn IN (1, 2)
GROUP BY t.total_connections;

/*
ROW 2, CARD A: Profiles created daily
Visualization: Line chart
X: day, Y: profiles_created
*/
SELECT
  DATE_TRUNC('day', i.created_at)::date AS day,
  COUNT(*)::int AS profiles_created
FROM items i
WHERE i.item_network = {{network_id}}
  AND i.item_type = 'profile_1.0'
[[ AND i.item_domain = {{domain}} ]]
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 1;

/*
ROW 2, CARD B: Connections daily
Visualization: Line chart
X: day, Y: total_connections
*/
SELECT
  DATE_TRUNC('day', a.created_at)::date AS day,
  COUNT(*)::int AS total_connections
FROM item_actions a
WHERE a.partition_network = {{network_id}}
  AND a.action_type = 'connect'
[[ AND a.source_item_domain = {{domain}} ]]
[[ AND a.created_at::date >= {{start_date}} ]]
[[ AND a.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 1;

/*
CARD 01: KPI summary (total profiles, complete profiles, connected profiles)
Visualization: Number cards (3)
*/
SELECT
  COUNT(*)::int AS total_profiles,
  COUNT(*) FILTER (WHERE COALESCE(m.profile_completion_pct, 0) >= 100)::int AS complete_profiles,
  COUNT(*) FILTER (
    WHERE COALESCE((m.initiated->>'create')::int, 0) + COALESCE((m.received->>'create')::int, 0) > 0
  )::int AS connected_profiles
FROM item_metrics m
WHERE m.item_network = {{network_id}}
[[ AND m.item_domain = {{domain}} ]]
[[ AND m.profile_created_at::date >= {{start_date}} ]]
[[ AND m.profile_created_at::date <= {{end_date}} ]];

/*
CARD 02: Profiles registered over time by domain
Visualization: Line or area chart
X: month, Series: item_domain, Y: profiles_registered
*/
SELECT
  DATE_TRUNC('month', i.created_at)::date AS month,
  i.item_domain,
  COUNT(*)::int AS profiles_registered
FROM items i
WHERE i.item_network = {{network_id}}
  AND i.item_type = 'profile_1.0'
[[ AND i.item_domain = {{domain}} ]]
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1, 2
ORDER BY 1, 2;

/*
CARD 03: Profile status distribution by domain
Uses status rules materialized in item_metrics.profile_status
(new, active, at_risk, inactive)
Visualization: Stacked bar
*/
SELECT
  m.item_domain,
  COALESCE(m.profile_status, 'unknown') AS profile_status,
  COUNT(*)::int AS profiles
FROM item_metrics m
WHERE m.item_network = {{network_id}}
[[ AND m.item_domain = {{domain}} ]]
GROUP BY 1, 2
ORDER BY 1, 2;

/*
CARD 04: Connections funnel by action status
Maps canonical statuses to dashboard bucket labels.
Visualization: Funnel or bar chart
*/
SELECT
  CASE
    WHEN LOWER(a.action_status) = 'created' THEN 'Requested'
    WHEN LOWER(a.action_status) = 'accepted' THEN 'Accepted'
    WHEN LOWER(a.action_status) = 'rejected' THEN 'Declined'
    WHEN LOWER(a.action_status) IN ('cancelled', 'canceled') THEN 'Cancelled'
    ELSE a.action_status
  END AS action_bucket,
  COUNT(*)::int AS actions
FROM item_actions a
WHERE a.partition_network = {{network_id}}
  AND a.action_type = 'connect'
[[ AND a.source_item_domain = {{domain}} ]]
[[ AND a.created_at::date >= {{start_date}} ]]
[[ AND a.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 2 DESC;

/*
CARD 05: Monthly connect acceptance rate
Visualization: Line chart (percentage)
*/
WITH monthly AS (
  SELECT
    DATE_TRUNC('month', a.created_at)::date AS month,
    COUNT(*) FILTER (WHERE LOWER(a.action_status) = 'created')::numeric AS requested,
    COUNT(*) FILTER (WHERE LOWER(a.action_status) = 'accepted')::numeric AS accepted
  FROM item_actions a
  WHERE a.partition_network = {{network_id}}
    AND a.action_type = 'connect'
  [[ AND a.source_item_domain = {{domain}} ]]
  [[ AND a.created_at::date >= {{start_date}} ]]
  [[ AND a.created_at::date <= {{end_date}} ]]
  GROUP BY 1
)
SELECT
  month,
  requested,
  accepted,
  ROUND((accepted / NULLIF(requested, 0)) * 100.0, 2) AS acceptance_rate_pct
FROM monthly
ORDER BY month;

/*
CARD 06: Connection matrix (who connects with whom)
Visualization: Pivot table or heatmap
*/
SELECT
  a.source_item_domain,
  a.target_item_domain,
  COUNT(*)::int AS connection_count
FROM item_actions a
WHERE a.partition_network = {{network_id}}
  AND a.action_type = 'connect'
[[ AND a.created_at::date >= {{start_date}} ]]
[[ AND a.created_at::date <= {{end_date}} ]]
GROUP BY 1, 2
ORDER BY 3 DESC;

/*
CARD 07: Person with disability profiles by gender
Schema field: item_state.gender
Visualization: Donut chart
*/
SELECT
  COALESCE(NULLIF(TRIM(i.item_state->>'gender'), ''), 'Unknown') AS gender,
  COUNT(*)::int AS profiles
FROM items i
WHERE i.item_network = {{network_id}}
  AND i.item_domain = 'person_with_disability'
  AND i.item_type = 'profile_1.0'
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 2 DESC;

/*
CARD 08: Person with disability distribution by disability type
Schema field: item_state.disability_type[]
Visualization: Horizontal bar chart
*/
SELECT
  d.disability_type,
  COUNT(*)::int AS profiles
FROM items i
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(i.item_state->'disability_type') = 'array' THEN i.item_state->'disability_type'
    ELSE '[]'::jsonb
  END
) AS d(disability_type)
WHERE i.item_network = {{network_id}}
  AND i.item_domain = 'person_with_disability'
  AND i.item_type = 'profile_1.0'
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 2 DESC;

/*
CARD 09: Person with disability support needs mix
Schema field: item_state.support_needed[]
Visualization: Bar chart
*/
SELECT
  s.support_needed,
  COUNT(*)::int AS profiles
FROM items i
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(i.item_state->'support_needed') = 'array' THEN i.item_state->'support_needed'
    ELSE '[]'::jsonb
  END
) AS s(support_needed)
WHERE i.item_network = {{network_id}}
  AND i.item_domain = 'person_with_disability'
  AND i.item_type = 'profile_1.0'
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 2 DESC;

/*
CARD 10: Service provider categories
Schema field: item_state.provider_category
Visualization: Donut or bar
*/
SELECT
  COALESCE(NULLIF(TRIM(i.item_state->>'provider_category'), ''), 'Unknown') AS provider_category,
  COUNT(*)::int AS providers
FROM items i
WHERE i.item_network = {{network_id}}
  AND i.item_domain = 'service_provider'
  AND i.item_type = 'profile_1.0'
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 2 DESC;

/*
CARD 11: City distribution across service_provider, employer, ngo
Schema fields:
- service_provider: operating_cities[]
- employer: hiring_cities[]
- ngo: operating_cities[]
Visualization: Stacked bar (city on X, domain as series)
*/
SELECT
  city.city_name,
  i.item_domain,
  COUNT(*)::int AS profiles
FROM items i
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN i.item_domain = 'service_provider'
      AND jsonb_typeof(i.item_state->'operating_cities') = 'array'
      THEN i.item_state->'operating_cities'
    WHEN i.item_domain = 'employer'
      AND jsonb_typeof(i.item_state->'hiring_cities') = 'array'
      THEN i.item_state->'hiring_cities'
    WHEN i.item_domain = 'ngo'
      AND jsonb_typeof(i.item_state->'operating_cities') = 'array'
      THEN i.item_state->'operating_cities'
    ELSE '[]'::jsonb
  END
) AS city(city_name)
WHERE i.item_network = {{network_id}}
  AND i.item_domain IN ('service_provider', 'employer', 'ngo')
  AND i.item_type = 'profile_1.0'
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1, 2
ORDER BY 3 DESC;

/*
CARD 12: Data quality - profiles missing geo points
Uses items.item_locations (resolved geocoding output)
Visualization: Table or bar
*/
SELECT
  i.item_domain,
  COUNT(*)::int AS total_profiles,
  COUNT(*) FILTER (
    WHERE i.item_locations IS NULL OR i.item_locations = '[]'::jsonb
  )::int AS missing_geo_profiles,
  ROUND(
    (
      COUNT(*) FILTER (WHERE i.item_locations IS NULL OR i.item_locations = '[]'::jsonb)::numeric
      / NULLIF(COUNT(*)::numeric, 0)
    ) * 100.0,
    2
  ) AS missing_geo_pct
FROM items i
WHERE i.item_network = {{network_id}}
  AND i.item_type = 'profile_1.0'
[[ AND i.item_domain = {{domain}} ]]
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 4 DESC;

/*
CARD 13: Onboarding channel split (for aggregator ops)
Visualization: Donut chart
*/
SELECT
  COALESCE(NULLIF(TRIM(m.onboarded_via), ''), 'unknown') AS onboarded_via,
  COUNT(*)::int AS profiles
FROM item_metrics m
WHERE m.item_network = {{network_id}}
[[ AND m.item_domain = {{domain}} ]]
GROUP BY 1
ORDER BY 2 DESC;

/*
CARD 14: Domain leaderboard by active profiles
Visualization: Ranked bar chart
*/
SELECT
  m.item_domain,
  COUNT(*) FILTER (WHERE m.profile_status = 'active')::int AS active_profiles,
  COUNT(*)::int AS total_profiles,
  ROUND(
    (COUNT(*) FILTER (WHERE m.profile_status = 'active')::numeric / NULLIF(COUNT(*)::numeric, 0)) * 100.0,
    2
  ) AS active_rate_pct
FROM item_metrics m
WHERE m.item_network = {{network_id}}
GROUP BY 1
ORDER BY active_profiles DESC;


-- --------------------------------------------------------
--            SERVICE PROVIDER ANALYTICS
-- --------------------------------------------------------
-- Data assumptions (Purple Dot service provider profile schema):
-- - item_domain = 'service_provider'
-- - arrays in item_state: support_services[], disabilities_served[], operating_cities[]
-- - optional geo array in items.item_locations: [{lat, lng, label?}, ...]
--
-- Metabase variables used in this section:
--   {{network_id}}   text (default: purple_dot)
--   {{start_date}}   date (optional)
--   {{end_date}}     date (optional)

/*
KPI CARDS: Providers | Cities | Services | Avg KPI
- total_providers: total service_provider profiles
- total_cities: distinct operating cities covered by providers
- total_services: distinct services offered across providers
- avg_kpi: average profile completion % (from item_metrics)
Visualization: Number cards (4)
*/
WITH providers AS (
  SELECT i.item_id, i.item_state
  FROM items i
  WHERE i.item_network = {{network_id}}
    AND i.item_domain = 'service_provider'
    AND i.item_type = 'profile_1.0'
  [[ AND i.created_at::date >= {{start_date}} ]]
  [[ AND i.created_at::date <= {{end_date}} ]]
),
cities AS (
  SELECT DISTINCT LOWER(TRIM(city.city_name)) AS city_name
  FROM providers p
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(p.item_state->'operating_cities') = 'array' THEN p.item_state->'operating_cities'
      ELSE '[]'::jsonb
    END
  ) AS city(city_name)
  WHERE NULLIF(TRIM(city.city_name), '') IS NOT NULL
),
services AS (
  SELECT DISTINCT LOWER(TRIM(s.service_name)) AS service_name
  FROM providers p
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(p.item_state->'support_services') = 'array' THEN p.item_state->'support_services'
      ELSE '[]'::jsonb
    END
  ) AS s(service_name)
  WHERE NULLIF(TRIM(s.service_name), '') IS NOT NULL
)
SELECT
  (SELECT COUNT(*)::int FROM providers) AS total_providers,
  (SELECT COUNT(*)::int FROM cities) AS total_cities,
  (SELECT COUNT(*)::int FROM services) AS total_services,
  ROUND(
    COALESCE((
      SELECT AVG(m.profile_completion_pct)::numeric
      FROM item_metrics m
      WHERE m.item_network = {{network_id}}
        AND m.item_domain = 'service_provider'
      [[ AND m.profile_created_at::date >= {{start_date}} ]]
      [[ AND m.profile_created_at::date <= {{end_date}} ]]
    ), 0),
    2
  ) AS avg_kpi;

/*
SERVICES OFFERED
Horizontal bar chart
X: providers, Y: service_name
*/
SELECT
  s.service_name,
  COUNT(DISTINCT i.item_id)::int AS providers
FROM items i
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(i.item_state->'support_services') = 'array' THEN i.item_state->'support_services'
    ELSE '[]'::jsonb
  END
) AS s(service_name)
WHERE i.item_network = {{network_id}}
  AND i.item_domain = 'service_provider'
  AND i.item_type = 'profile_1.0'
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 2 DESC, 1;

/*
DISABILITIES SUPPORTED
Donut chart
Legend: disability_type, Value: providers
*/
SELECT
  d.disability_type,
  COUNT(DISTINCT i.item_id)::int AS providers
FROM items i
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(i.item_state->'disabilities_served') = 'array' THEN i.item_state->'disabilities_served'
    ELSE '[]'::jsonb
  END
) AS d(disability_type)
WHERE i.item_network = {{network_id}}
  AND i.item_domain = 'service_provider'
  AND i.item_type = 'profile_1.0'
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 2 DESC, 1;

/*
INDIA MAP
Bubble map dataset from item_locations
Latitude: lat, Longitude: lng, Bubble size: providers
*/
SELECT
  ROUND((loc.pt->>'lat')::numeric, 4) AS lat,
  ROUND((loc.pt->>'lng')::numeric, 4) AS lng,
  COALESCE(NULLIF(TRIM(loc.pt->>'label'), ''), 'Unknown') AS location_label,
  COUNT(DISTINCT i.item_id)::int AS providers
FROM items i
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN jsonb_typeof(i.item_locations) = 'array' THEN i.item_locations
    ELSE '[]'::jsonb
  END
) AS loc(pt)
WHERE i.item_network = {{network_id}}
  AND i.item_domain = 'service_provider'
  AND i.item_type = 'profile_1.0'
  AND NULLIF(loc.pt->>'lat', '') IS NOT NULL
  AND NULLIF(loc.pt->>'lng', '') IS NOT NULL
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1, 2, 3
ORDER BY 4 DESC;

/*
PROVIDER CATEGORIES
Treemap dataset
Group: provider_category, Value: providers
*/
SELECT
  COALESCE(NULLIF(TRIM(i.item_state->>'provider_category'), ''), 'Unknown') AS provider_category,
  COUNT(*)::int AS providers
FROM items i
WHERE i.item_network = {{network_id}}
  AND i.item_domain = 'service_provider'
  AND i.item_type = 'profile_1.0'
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
GROUP BY 1
ORDER BY 2 DESC, 1;

/*
MONTHLY GROWTH
Line chart
X: month, Y: new_providers (optionally plot running_total as 2nd series)
*/
WITH monthly AS (
  SELECT
    DATE_TRUNC('month', i.created_at)::date AS month,
    COUNT(*)::int AS new_providers
  FROM items i
  WHERE i.item_network = {{network_id}}
    AND i.item_domain = 'service_provider'
    AND i.item_type = 'profile_1.0'
  [[ AND i.created_at::date >= {{start_date}} ]]
  [[ AND i.created_at::date <= {{end_date}} ]]
  GROUP BY 1
)
SELECT
  month,
  new_providers,
  SUM(new_providers) OVER (ORDER BY month)::int AS running_total,
  ROUND(
    (
      (new_providers::numeric - LAG(new_providers) OVER (ORDER BY month)::numeric)
      / NULLIF(LAG(new_providers) OVER (ORDER BY month)::numeric, 0)
    ) * 100.0,
    2
  ) AS mom_growth_pct
FROM monthly
ORDER BY month;

/*
TOP PROVIDERS TABLE
Sort by total_connections desc, then completion pct desc.
*/
SELECT
  i.item_id,
  COALESCE(NULLIF(TRIM(i.item_state->>'service_provider_name'), ''), 'Unknown') AS provider_name,
  COALESCE(NULLIF(TRIM(i.item_state->>'provider_category'), ''), 'Unknown') AS provider_category,
  COALESCE(jsonb_array_length(
    CASE
      WHEN jsonb_typeof(i.item_state->'operating_cities') = 'array' THEN i.item_state->'operating_cities'
      ELSE '[]'::jsonb
    END
  ), 0)::int AS cities_count,
  COALESCE(jsonb_array_length(
    CASE
      WHEN jsonb_typeof(i.item_state->'support_services') = 'array' THEN i.item_state->'support_services'
      ELSE '[]'::jsonb
    END
  ), 0)::int AS services_count,
  COALESCE(jsonb_array_length(
    CASE
      WHEN jsonb_typeof(i.item_state->'disabilities_served') = 'array' THEN i.item_state->'disabilities_served'
      ELSE '[]'::jsonb
    END
  ), 0)::int AS disabilities_count,
  COALESCE(m.profile_completion_pct, 0)::numeric(5,2) AS profile_completion_pct,
  (
    COALESCE((m.initiated->>'create')::int, 0)
    + COALESCE((m.received->>'create')::int, 0)
  )::int AS total_connections,
  (
    COALESCE((m.initiated->>'accept')::int, 0)
    + COALESCE((m.received->>'accept')::int, 0)
  )::int AS accepted_connections,
  i.created_at::date AS profile_created_date
FROM items i
LEFT JOIN item_metrics m
  ON m.item_id = i.item_id
WHERE i.item_network = {{network_id}}
  AND i.item_domain = 'service_provider'
  AND i.item_type = 'profile_1.0'
[[ AND i.created_at::date >= {{start_date}} ]]
[[ AND i.created_at::date <= {{end_date}} ]]
ORDER BY total_connections DESC, profile_completion_pct DESC, provider_name
LIMIT 25;
