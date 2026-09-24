-- Runs once when the Postgres volume is first created.
-- A separate database for the integration test suite.
CREATE DATABASE crm_test OWNER crm;
