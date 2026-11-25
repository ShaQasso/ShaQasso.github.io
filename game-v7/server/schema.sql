-- one row per submitted run of today's gut
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,            -- the daily world (UTC date) the run was played on
  initials TEXT NOT NULL,       -- three letters, A-Z
  score INTEGER NOT NULL,
  months INTEGER NOT NULL,      -- months reached
  outcome TEXT NOT NULL,        -- 'remission' or 'flare-out'
  ticket TEXT NOT NULL UNIQUE,  -- one score per ticket
  moves TEXT NOT NULL,          -- the run's moves, kept so a score can be replayed and checked later
  visitor TEXT NOT NULL,        -- salted hash of the IP address, for the per-visitor limit (never the address itself)
  created INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 -- set to 1 in the Cloudflare dashboard to take a score off the board
);
CREATE INDEX IF NOT EXISTS scores_day ON scores (day, hidden, score DESC);
CREATE INDEX IF NOT EXISTS scores_all ON scores (hidden, score DESC);
CREATE INDEX IF NOT EXISTS scores_visitor ON scores (visitor, day);
