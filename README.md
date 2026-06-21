# HarborMart Backend

This repository contains the Java Spring Boot microservices backend for the HarborMart Ecommerce platform. 

Currently, it consists of:
- **API Gateway** (`api-gateway`): Routes external traffic to downstream services and enforces JWT validation. Runs on port `8080`.
- **API Auth** (`api-auth`): Manages user registration, login, and generates JWT tokens. Runs on port `8081`.

---

## Prerequisites

Before running the backend, make sure you have the following installed:
- **Java 21** (JDK)
- **Maven** (3.8+ recommended)
- **Docker** & **Docker Compose** (for running the PostgreSQL database)

---

## Getting Started

### 1. Build the Project

First, build the entire multi-module Maven project from the root `backend` directory.

```bash
cd backend
mvn clean install
```

This will download dependencies, compile the code, and package the `.jar` files.

### 2. Start the Database

The `api-auth` service requires a PostgreSQL database to store user credentials. A `docker-compose.yml` file is provided to quickly spin up a local instance.

```bash
cd backend
docker-compose up -d
```

> **Note**: This will start a container named `harbormart-postgres` on port `5432` with user `harbormart_user` and password `harbormart_password`. The database schema is automatically managed and initialized by Flyway upon service startup.

### 3. Run the Microservices

You can run the microservices directly using Maven. You must start the database first, then start the Auth service, and finally the Gateway.

**Terminal 1: Start API Auth**
```bash
cd backend/api-auth
mvn spring-boot:run
```
*(The Auth service will start on port `8081` and Flyway will automatically create the `users` table).*

**Terminal 2: Start API Gateway**
```bash
cd backend/api-gateway
mvn spring-boot:run
```
*(The Gateway will start on port `8080`).*

---

## API Usage Examples

All external traffic should go through the API Gateway on `localhost:8080`. 

### Register a New User
```bash
curl -X POST http://localhost:8080/api/auth/register \
-H "Content-Type: application/json" \
-d '{
  "username": "testuser",
  "email": "testuser@example.com",
  "password": "password123"
}'
```

### Login and Get JWT
```bash
curl -X POST http://localhost:8080/api/auth/login \
-H "Content-Type: application/json" \
-d '{
  "username": "testuser",
  "password": "password123"
}'
```

*(You will receive a response containing the JWT `token`, which you must include in the `Authorization: Bearer <token>` header for subsequent requests to protected routes).*
