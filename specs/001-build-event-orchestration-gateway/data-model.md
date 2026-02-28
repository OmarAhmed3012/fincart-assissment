# Data Model: Resilient Event Orchestration Gateway

## Overview

This model defines the persistent entities and queue payload used to implement asynchronous courier-event intake, idempotent processing, retries, and dead-letter handling.

## Entities

### 1) CourierEvent (transport contract)
- **Purpose**: Canonical inbound event message accepted by `gateway-api` and forwarded to queue processing.
- **Core fields**:
  - `eventId` (string, required)
  - `eventType` (string, required)
  - `occurredAt` (timestamp, required)
  - `source` (string, required)
  - `idempotencyKey` (string, required)
  - `signatureMeta` (object, required; algorithm, timestamp, signature)
  - `payload` (object, required)
  - `traceId` (string, required)
  - `receivedAt` (timestamp, required)
- **Validation rules**:
  - Signature must verify against configured secret/material.
  - Signature timestamp must fall within allowed skew window.
  - Required business identifiers must be present in payload.

### 2) ProcessedEvent (`processed_events`)
- **Purpose**: Idempotency and processing ledger for each unique event identity.
- **Core fields**:
  - `idempotencyKey` (string, unique)
  - `eventId` (string)
  - `eventType` (string)
  - `status` (enum: `received`, `processing`, `processed`, `failed`, `dead_lettered`)
  - `attemptCount` (number)
  - `lastErrorCode` (string, nullable)
  - `lastErrorMessage` (string, nullable)
  - `firstSeenAt` (timestamp)
  - `updatedAt` (timestamp)
  - `expiresAt` (timestamp, optional for TTL)
- **Indexes**:
  - Unique: `idempotencyKey`.
  - Secondary: `(status, updatedAt)`.
  - TTL: `expiresAt` (default retention 30 days for terminal records).
- **State transitions**:
  - `received -> processing`
  - `processing -> processed`
  - `processing -> failed` (retryable)
  - `failed -> processing` (next retry)
  - `failed -> dead_lettered` (max attempts or permanent error)

### 3) ActiveShipment (`active_shipments`)
- **Purpose**: Current shipment/order context used by worker during event application.
- **Core fields**:
  - `shipmentId` (string, unique)
  - `orderId` (string)
  - `currentState` (string)
  - `lastEventId` (string)
  - `lastEventType` (string)
  - `lastEventAt` (timestamp)
  - `metadata` (object)
  - `createdAt` (timestamp)
  - `updatedAt` (timestamp)
- **Indexes**:
  - Unique: `shipmentId`.
  - Secondary: `orderId`, `(currentState, updatedAt)`.
- **Validation rules**:
  - Updates must be idempotent by `idempotencyKey`.
  - Out-of-order events may be ignored or flagged based on event-time checks.

### 4) DeadLetterEvent (`dead_letter_events`)
- **Purpose**: Terminal persistence for events that cannot be successfully processed.
- **Core fields**:
  - `eventId` (string)
  - `idempotencyKey` (string)
  - `eventType` (string)
  - `terminalReasonCode` (string)
  - `terminalReasonMessage` (string)
  - `attemptCount` (number)
  - `attemptHistory` (array of attempt summaries)
  - `payloadSnapshot` (object)
  - `reviewStatus` (enum: `pending`, `reviewed`, `replayed`, `closed`)
  - `createdAt` (timestamp)
  - `expiresAt` (timestamp)
- **Indexes**:
  - Secondary: `(reviewStatus, createdAt)`, `(createdAt)`.
  - TTL: `expiresAt` (default retention 90 days).
- **Validation rules**:
  - `attemptCount` must match highest attempt in `attemptHistory`.
  - `terminalReasonCode` required for every persisted DLQ record.

## Relationships

- `CourierEvent.idempotencyKey` maps 1:1 to `ProcessedEvent.idempotencyKey`.
- `ProcessedEvent.eventId` can map to one `ActiveShipment.lastEventId` update path.
- `ProcessedEvent` terminal failures produce one `DeadLetterEvent` record.

## Queue Job Payload Contract

- **Queue**: `courier-events-main`
- **Payload fields**:
  - `eventId`, `eventType`, `occurredAt`, `source`
  - `idempotencyKey`, `traceId`
  - `signatureMeta`
  - `payload`
  - `receivedAt`
  - `attempt` (worker-managed)
- **DLQ payload extension**:
  - `terminalReasonCode`
  - `terminalReasonMessage`
  - `attemptHistory`
  - `deadLetteredAt`
