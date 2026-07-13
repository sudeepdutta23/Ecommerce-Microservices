-- Database-per-service. In production each service would point at its own
-- PostgreSQL instance/cluster; locally we create isolated databases inside
-- one container. No service may connect to another service's database.
CREATE DATABASE auth_db;
CREATE DATABASE user_db;
CREATE DATABASE catalog_db;
CREATE DATABASE order_db;
CREATE DATABASE notification_db;
CREATE DATABASE analytics_db;
