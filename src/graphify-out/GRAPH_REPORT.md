# Graph Report - src  (2026-04-29)

## Corpus Check
- 9 files · ~5,051 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 52 nodes · 53 edges · 1 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 1|Community 1]]

## God Nodes (most connected - your core abstractions)
1. `handleVerify()` - 4 edges
2. `handleKeyDown()` - 4 edges
3. `cognitoReq()` - 4 edges
4. `signIn()` - 4 edges
5. `handleSignIn()` - 3 edges
6. `handleSignUp()` - 3 edges
7. `signUp()` - 3 edges
8. `confirmSignUp()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `handleSignIn()` --calls--> `signIn()`  [INFERRED]
  AuthScreen.tsx → cognito.ts
- `handleSignUp()` --calls--> `signUp()`  [INFERRED]
  AuthScreen.tsx → cognito.ts
- `handleVerify()` --calls--> `confirmSignUp()`  [INFERRED]
  AuthScreen.tsx → cognito.ts
- `handleVerify()` --calls--> `signIn()`  [INFERRED]
  AuthScreen.tsx → cognito.ts

## Communities

### Community 1 - "Community 1"
Cohesion: 0.3
Nodes (8): handleKeyDown(), handleSignIn(), handleSignUp(), handleVerify(), cognitoReq(), confirmSignUp(), signIn(), signUp()

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 2 inferred relationships involving `handleVerify()` (e.g. with `confirmSignUp()` and `signIn()`) actually correct?**
  _`handleVerify()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `signIn()` (e.g. with `handleSignIn()` and `handleVerify()`) actually correct?**
  _`signIn()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._