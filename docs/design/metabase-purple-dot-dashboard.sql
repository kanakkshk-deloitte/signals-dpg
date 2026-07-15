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
