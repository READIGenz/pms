----------------------- Enums (Keep data clean)
-- Project attribute enums
CREATE TYPE project_status   AS ENUM ('Ongoing','Completed');
CREATE TYPE project_stage    AS ENUM ('Construction','Fitout','Design');
CREATE TYPE project_health   AS ENUM ('Good','At Risk','Delayed');

-- Roles (per-project)
CREATE TYPE project_role AS ENUM (
  'Customer','PMC','Architect','Designer','Contractor','Legal/Liaisoning','Ava-PMT',
  'Engineer (Contractor)','DC (Contractor)','DC (PMC)','Inspector (PMC)','HOD (PMC)'
);

-- Generic form status (to power “Open Forms” & schedule bucket)
CREATE TYPE form_status AS ENUM ('open','closed');