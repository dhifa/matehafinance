# Security Specifications & Threat Vector Analysis for Mateha Finance

This document outlines the security invariants, threat vectors, and mock test scenarios for the Mateha Finance persistent collaboration platform.

## 1. Data Invariants
1. **Authentication Requirement**: Every access (read or write) must be authenticated with a verified Email and Password account. Google Login or Anonymous access is not permitted.
2. **Access Isolation**: Standard user projects must only be listable, readable, and deleteable by their respective `ownerId`.
3. **Share Link Collaborative Gate**: Anyone who possesses a specific project share link (`projectId`) can perform a `get` (read) of that specific project, and can exclusively modify `realisasi.accommodation` (to add items to Point B) while all other fields (such as `ownerId`, `name`, `rab`, `realisasi.income`, `realisasi.feeDistribution`, etc.) remain strictly immutable for non-owners.
4. **Temporal Integrity**: Creation and updates must use server timestamps (`request.time`) if timestamps are updated. Let's trace it through `projects/{projectId}`.

## 2. Threat Vector - The "Dirty Dozen" Payloads

Here are 12 specific hostile payloads trying to bypass security rules:
1. **Unauthorized List Scan**: A rogue logged-in user tries to fetch the list of all projects. Rejection: standard `allow list` must check `resource.data.ownerId == request.auth.uid`.
2. **Identity Spoofing on Create**: User `A` tries to create a project setting `ownerId` to user `B`. Rejection: `incoming().ownerId == request.auth.uid`.
3. **Ghost Fields Injection**: Injecting a field `isVerifiedAdmin: true` on project document creation or update. Rejection: strict key checks.
4. **Malicious ID Poisoning**: Injected projectId of 500 characters of junk to stress indexing. Rejection: `isValidId(projectId)` where length <= 128.
5. **RAB tampering via Share Link**: Non-owner tries to change `rab` entries or ratios. Rejection: `affectedKeys().hasOnly(['realisasi'])`.
6. **Income tampering via Share Link**: Non-owner tries to update `realisasi.income`. Rejection: `affectedKeys().hasOnly(['realisasi'])` with validation checking `incoming().realisasi.accommodation` difference.
7. **Fee pool tampering via Share Link**: Non-owner tries to increase `realisasi.feeDistribution` to steal funds. Rejection: non-owner updates restricted strictly to Point B.
8. **Immortal Owner Shift**: Non-owner attempts to hijack the project by updating `ownerId` to their own. Rejection: `incoming().ownerId == existing().ownerId`.
9. **Tampering with of non-owner projects**: Non-owner trying to delete a project. Rejection: `resource.data.ownerId == request.auth.uid`.
10. **Spoofed Email Access**: User registration attempting to specify trusted administrative emails or other people's identities. Rejection: `request.auth.uid == userId`.
11. **Negative budget validation**: Injecting negative expenses or item counts to overflow calculations. Rejection: properties checking `item.expense >= 0` and `item.qty >= 0`.
12. **Double-charging deletion**: Attempting to delete accommodation rows without being direct owner or authorized. Rejection: restricted keys on updates.

## 3. Test Cases (TDD Spec)
We assert that `firestore.rules` rejects all such attempts.

```typescript
// Jest test cases checking standard permission_denied for all mock invalid scenarios.
describe("Mateha Finance Fortress Rules", () => {
  it("forbids unauthorized reads", async () => { ... });
  it("forbids non-owner deletion", async () => { ... });
  it("only allows Point B updates for shared links", async () => { ... });
});
```
