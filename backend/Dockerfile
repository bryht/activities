# --- build stage ---
FROM rust:1.88-slim AS build
WORKDIR /app
# Cache dependencies first.
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release || true
# Real sources.
COPY migrations ./migrations
COPY src ./src
RUN touch src/main.rs && cargo build --release

# --- runtime stage ---
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/release/kidgo-api /usr/local/bin/kidgo-api
ENV PORT=8080
EXPOSE 8080
CMD ["kidgo-api"]
