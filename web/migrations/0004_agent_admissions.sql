CREATE TABLE agent_admissions (
 id TEXT PRIMARY KEY,
 owner_hash TEXT NOT NULL,
 network_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX agent_admission_time ON agent_admissions(created_at);
CREATE INDEX agent_admission_owner ON agent_admissions(owner_hash,created_at);
CREATE INDEX agent_admission_network ON agent_admissions(network_hash,created_at);
