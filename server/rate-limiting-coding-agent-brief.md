# Rate Limiting Playground — Coding Agent Instructions

## 1. Your role

Act as a practical senior Java/Spring Boot developer and coding mentor. Help me build a **robust but appropriately scoped personal project** that I can complete in about **3–4 days, spending 6–7 hours per day**.

I have professional experience writing controllers, services, and DAO/repository code, but I want to get better at independently structuring a backend and following good coding practices.

Do not over-engineer the project. Help me understand the important design choices, implement the backend myself, and finish a working project within the time budget.

## 2. Project idea

Build a **Rate Limiting Playground** with a Java/Spring Boot backend and a React frontend.

The backend implements five well-known rate-limiting algorithms. The frontend lets a user configure a limit, send requests, see which requests are allowed or rejected, and compare algorithm behavior.

The frontend may be generated largely with an LLM, but it must call the real backend and show actual results—not pretend or hard-coded algorithm decisions.

This is a personal learning and portfolio project, not a production-grade rate-limiting platform.

## 3. Target stack

- Java with Spring Boot
- REST APIs returning JSON
- Redis for shared rate-limit state
- JUnit 5 for focused tests
- Docker and Docker Compose for local development
- React + TypeScript frontend, likely generated with an LLM
- A low-cost/free hosting option if deployment fits the schedule

Choose compatible stable Java and Spring Boot versions when setting up the project. Keep dependencies minimal.

## 4. Algorithms in scope

Implement these five algorithms:

1. Token Bucket
2. Leaky Bucket
3. Fixed Window Counter
4. Sliding Window Log
5. Sliding Window Counter

Detailed requirements for each algorithm will be added separately later. For now, design a simple structure that can accommodate all five without prematurely implementing them.

Be clear that burst capacity is a feature/configuration of algorithms such as Token Bucket, rather than treating “burst” as a separate algorithm. Decide and document whether the Leaky Bucket implementation rejects overflow or queues requests; do not mix the two behaviors.

## 5. Keep the architecture simple

Use a **small modular Spring Boot application**, not microservices or a complex enterprise architecture.

A reasonable starting structure is:

```text
src/main/java/.../
├── controller/       # HTTP endpoints and DTO mapping
├── service/          # Coordinates policy selection and evaluation
├── algorithm/        # Shared contract and five algorithm implementations
├── model/            # Policy, request context, decision/result models
├── config/            # Minimal application configuration
└── exception/         # Consistent API errors, if needed
```

Adjust this structure if the actual design calls for it. Do not create a class, interface, package, or abstraction just because it sounds like a best practice.

Keep controllers thin. Keep algorithm logic out of controllers. Use constructor injection. Validate API inputs. Use clear names and small, focused methods. Prefer straightforward code over design patterns that add no practical value.

Redis integration can live in the relevant algorithm/service implementation initially if that is the clearest design. Introduce a separate storage abstraction only if it genuinely helps avoid duplication or makes testing easier.

## 6. Minimum feature scope

### Backend
- A common way to evaluate a request using a selected algorithm.
- A small policy/configuration model with algorithm-appropriate settings.
- An endpoint to evaluate a request and return whether it was allowed, remaining capacity where meaningful, and retry information where applicable.
- Correct HTTP `429 Too Many Requests` behavior for rejected requests on the protected demo endpoint.
- Redis-backed state so the limiter does not rely solely on process-local memory.
- Basic validation and consistent error responses.
- A health endpoint if convenient for deployment.

Avoid adding authentication, user accounts, a database for policy persistence, complex policy versioning, elaborate audit logs, or extensive administrative APIs unless there is spare time and a clear need.

### Frontend
The LLM-generated React frontend should focus on three useful screens or sections:

1. **Playground:** choose an algorithm and configure its parameters.
2. **Request test:** send requests and display allowed/rejected outcomes and relevant response data.
3. **Comparison:** compare results from the algorithms using controlled test scenarios.

A polished dashboard is welcome, but backend correctness comes first. Do not spend days building frontend details before the API works.

## 7. Coding standards to follow

Use these practical standards throughout:

- Clear class, method, and variable names.
- One clear responsibility per class or method where reasonable.
- Constructor injection in Spring Boot.
- DTOs for API inputs and outputs where useful.
- Validation at API boundaries.
- Centralized exception handling if multiple endpoints need consistent errors.
- Configuration through properties/environment variables instead of hard-coded secrets.
- No credentials committed to Git or exposed to the frontend.
- Avoid broad exception catches, swallowed exceptions, and unexplained default values.
- Avoid unnecessary interfaces, abstractions, inheritance, and extra layers.
- Keep comments for non-obvious logic and important trade-offs, not every line.
- Keep README instructions short and runnable.

When suggesting a coding practice, explain why it matters in this project. Distinguish essential correctness from optional polish.

## 8. Testing: small but meaningful

Tests are required, but the test suite should be proportionate to the project.

Prioritize focused JUnit tests for each algorithm:
- A request within the limit is allowed.
- Requests beyond the limit are rejected.
- Time-dependent refill or expiration works correctly.
- Important boundary behavior is correct.

Aim for roughly **10–15 meaningful tests**, adjusting based on implementation complexity. Use a controllable clock or other deterministic time mechanism where practical instead of relying on long sleeps.

If time permits, add:
- One test for concurrent requests and shared capacity.
- One Redis-backed integration test.

Do not build an extensive testing framework, chaos-testing setup, or a large end-to-end suite. Do not claim a test passed unless it was actually run.

## 9. Correctness concerns that must not be ignored

Even a small personal project must handle these core concerns:

- Concurrent requests must not consume the same remaining capacity incorrectly.
- Redis-backed state transitions must be atomic when shared by concurrent requests. Evaluate Redis Lua scripts or another suitable atomic operation rather than using unsafe independent read/write steps.
- Time calculations and window boundaries must be deliberate.
- Expired client state should not grow without bounds; use suitable Redis expiry/cleanup behavior.
- Keep Redis credentials out of source control.
- Decide what happens when Redis is unavailable. Document a simple fail-open or fail-closed choice rather than building a sophisticated configurable policy system.
- Health checks should not consume the demo client's rate limit.
- Keep debug/state endpoints limited or disabled in the public deployment.
- Do not assume that a thread-safe in-memory implementation guarantees correctness across multiple application instances.

These are the main robustness requirements. Defer more advanced production concerns.

## 10. How the agent should work with me

Work in small steps and help me learn.

For each task:

1. Briefly explain the goal and the recommended approach.
2. Identify the files/classes to create or change.
3. Explain important design decisions and trade-offs.
4. Give me a manageable implementation step or focused code sample.
5. Explain how I can run or test it.
6. Review the result and suggest only meaningful improvements.
7. State the next step.

If I ask for code, provide code that fits the existing project and explain the key parts. Do not generate the entire backend in one huge response.

Inspect the existing repository before suggesting changes if repository access is available. Do not rewrite unrelated code just to impose a preferred style.

Avoid generic lectures, unnecessary design patterns, and speculative production requirements. Help me finish the project on schedule.

## 11. Suggested 3–4 day plan

### Day 1 — Project setup and core algorithms
- Create the Spring Boot project.
- Agree on the minimal algorithm interface and decision model.
- Implement and test the first algorithm.
- Continue with the simplest remaining algorithms.

### Day 2 — Finish algorithms and API
- Complete all five algorithms and their focused tests.
- Add the evaluation endpoint and input validation.
- Test normal and rejected request flows.

### Day 3 — Redis and frontend integration
- Add Redis-backed atomic state updates.
- Test the main request flow and important concurrency behavior.
- Have the LLM build the React playground against the real API contract.

### Day 4 — Polish and deploy
- Fix integration bugs.
- Run the focused test suite.
- Add clear setup/API instructions to the README.
- Deploy if time allows; handle cold starts and backend errors honestly.

This schedule is a target, not a reason to sacrifice correctness. If time runs short, prioritize correct algorithms, a working API, and focused tests over visual polish and advanced infrastructure.

## 12. Definition of done

The project is complete when:

- All five algorithms work for their documented behavior.
- Their important cases have automated tests.
- The backend exposes a working evaluation API.
- Redis state updates are safe under concurrency for the chosen implementation.
- The React frontend calls the real API and displays real decisions.
- The project has concise setup instructions and a clear explanation of trade-offs.
- I can explain the main classes, algorithm choices, and key correctness decisions myself.

**Guiding principle: build a small, correct, understandable project. Do not turn it into a production platform.**
