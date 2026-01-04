# Ignis Framework - Repository Test Cases

This document lists all test cases implemented in the `examples/vert/src/services/tests` directory.

## Summary

| Service | Test Cases | Category |
|---------|------------|----------|
| CrudTestService | 19 | Basic CRUD operations |
| TransactionTestService | 20 | Transaction handling |
| InclusionTestService | 15 | Many-to-many relations |
| ArrayOperatorTestService | 21 | PostgreSQL array operators |
| DefaultFilterTestService | 31 | Default filter functionality |
| HiddenPropertiesTestService | 17 | Hidden properties filtering |
| UserAuditTestService | 21 | User audit tracking (createdBy/modifiedBy) |
| **Total** | **144** | |

---

## 1. CrudTestService

Basic repository CRUD operations without transactions.

| Case | Name | Description |
|------|------|-------------|
| 1 | CreateSingle | Create a single record and verify persistence |
| 2 | CreateAll | Batch create multiple records |
| 3 | FindOne | Find single record with filter, test non-existent returns null |
| 4 | FindWithFilter | Test where, order (ASC/DESC), limit, skip/offset filters |
| 5 | FindById | Find record by ID, test non-existent ID returns null |
| 6 | UpdateById | Update single record by ID and verify changes |
| 7 | UpdateAll | Batch update with where filter, test UpdateBy alias |
| 8 | DeleteByIdAndDeleteAll | Delete single by ID, batch delete with filter |
| 9 | CreateWithNullValues | Create record with explicit null values |
| 10 | EmptyBatchCreate | Handle createAll with empty array |
| 11 | UpdateNonExistentRecord | UpdateById for non-existent ID returns count: 0 |
| 12 | DeleteNonExistentRecord | DeleteById for non-existent ID returns count: 0 |
| 13 | BoundaryValues | Test max/min integers, long strings, zero, negative values |
| 14 | CountOperation | Count with various filters (all, filtered, no matches) |
| 15 | ExistsWithOperation | Check existence before/after create/delete |
| 16 | ConcurrentCreates | Race condition test: 10 concurrent creates + duplicate code constraint test |
| 17 | UpdateWithPartialData | Partial update preserves unchanged fields |
| 18 | FindWithEmptyResult | Empty array returned for no matches |
| 19 | DoublePrecisionValues | DOUBLE PRECISION with relative tolerance: PI, small/large decimals, scientific notation |

---

## 2. TransactionTestService

Transaction handling and isolation tests.

| Case | Name | Description |
|------|------|-------------|
| 1 | CommitSuccess | Multiple creates persist after commit |
| 2 | RollbackOnError | Data not persisted after error triggers rollback |
| 3 | RollbackExplicit | Manual rollback discards changes |
| 4 | ReadWithinTransaction | Uncommitted data visible within tx, not outside |
| 5 | UpdateAndDeleteInTransaction | Update and delete within same transaction |
| 6 | UseInactiveTransactionAfterCommit | Error when using committed transaction |
| 7 | UseInactiveTransactionAfterRollback | Error when using rolled back transaction |
| 8 | IsolationLevelReadCommitted | Create transaction with READ_COMMITTED isolation |
| 9 | IsolationLevelSerializable | Create transaction with SERIALIZABLE isolation |
| 10 | CreateAllInTransaction | Batch create within transaction |
| 11 | MultipleRepositoriesInTransaction | Multiple repos share same transaction |
| 12 | ConcurrentTransactionsOnSameData | Two transactions modifying same record, verifies final state matches outcome |
| 13 | TransactionStateVerification | Verify isActive state before/after commit/rollback |
| 14 | DoubleCommitHandling | Error on second commit attempt |
| 15 | DoubleRollbackHandling | Error on second rollback attempt |
| 16 | RollbackVerifiesNoDataPersisted | Verify data within tx, confirm none persists after rollback |
| 17 | TransactionWithRelatedEntities | Create related entities (Product, SaleChannel, Junction) in tx |
| 18 | IsolationLevelRepeatableRead | Create transaction with REPEATABLE_READ isolation |
| 19 | TransactionWithCountAndExists | Count/ExistsWith operations within transaction context |
| 20 | LargeTransactionWithManyOperations | 50 creates + updates + deletes with exact count assertions (40 remaining, 24 updated) |

---

## 3. InclusionTestService

Many-to-many relationship and inclusion tests.

| Case | Name | Description |
|------|------|-------------|
| 1 | SetupAndBasicInclude | Create test data: 3 products, 3 channels, 6 junction records |
| 2 | ProductWithSaleChannels | Find Product with nested saleChannelProducts -> saleChannel |
| 3 | SaleChannelWithProducts | Find SaleChannel with nested saleChannelProducts -> product |
| 4 | JunctionTableWithBothRelations | Junction records with both product and saleChannel relations |
| 5 | NestedInclusion | Find multiple products with nested channel inclusions |
| 6 | Cleanup | Delete all test data (junction first due to FK) |
| 7 | ScopedRelationWithFilter | Include relations with where filter, tracks active/inactive/null counts |
| 8 | ScopedRelationWithOrder | Include relations with order clause |
| 9 | ScopedRelationWithLimit | Include relations with limit clause |
| 10 | EmptyRelationsHandling | Product with no relations returns empty array |
| 11 | MultipleRelationsAtSameLevel | Load multiple relations (creator, modifier) simultaneously |
| 12 | RelationFieldSelection | Select specific fields in relation scope |
| 13 | NestedRelationWithScope | Nested relations with price filter, exact count assertion (1 expensive product) |
| 14 | FindManyWithInclusions | Find multiple entities with inclusions loaded |
| 15 | IncludeWithWhereOnParent | Parent where filter combined with include |

---

## 4. ArrayOperatorTestService

PostgreSQL array column operators (contains, containedBy, overlaps).

| Case | Name | Description |
|------|------|-------------|
| 1 | SetupTestData | Create 5 products with various tag arrays |
| 2 | ContainsAllElements | `@>` operator: array contains ALL specified elements |
| 3 | ContainsSingleElement | `@>` operator: array contains single element |
| 4 | ContainsEmptyArray | `@>` with empty array (everything contains empty set) |
| 5 | ContainedByArray | `<@` operator: array is subset of provided elements |
| 6 | ContainedByEmptyArray | `<@` with empty array (only empty arrays match) |
| 7 | OverlapsWithArray | `&&` operator: arrays share at least one element |
| 8 | OverlapsNoMatch | `&&` with non-existent element returns empty |
| 9 | OverlapsEmptyArray | `&&` with empty array (no overlap possible) |
| 10 | CombinedWithOtherFilters | Array operator combined with price filter |
| 11 | ContainsWithAndOr | Array contains in OR conditions |
| 12 | Cleanup | Delete all array operator test data |
| 13 | LargeArrayContains | Array with 100+ elements |
| 14 | SpecialCharactersInArray | Unicode, emoji, spaces, slashes in array elements |
| 15 | DuplicateElementsInArray | Arrays with duplicate elements |
| 16 | CaseSensitivity | Case-sensitive array element matching |
| 17 | EmptyStringInArray | Empty string as array element |
| 18 | CombinedArrayOperators | Multiple array operators in AND condition |
| 19 | ArrayWithNumericLikeStrings | String arrays with numeric-looking values |
| 20 | ArrayOperatorWithOrderAndLimit | Array filter with ORDER BY and LIMIT |
| 21 | NullArrayColumn | Null array excluded from contains using existing tag to isolate behavior |

---

## 5. DefaultFilterTestService

Default filter (automatic query filtering) functionality.

### Basic Operations

| Case | Name | Description |
|------|------|-------------|
| 1 | DefaultFilterApplied | Default filter automatically excludes price=0 products |
| 2 | SkipDefaultFilterBypass | skipDefaultFilter option bypasses default filter |
| 3 | UserFilterMergedWithDefault | User filter AND default filter both applied |
| 4 | UserFilterOverridesDefaultSameKey | User can override default filter with skipDefaultFilter |
| 5 | FindOneWithDefaultFilter | FindOne applies default filter |
| 6 | FindByIdWithDefaultFilter | FindById applies default filter |
| 7 | CountWithDefaultFilter | Count applies default filter |
| 8 | ExistsWithDefaultFilter | ExistsWith applies default filter |

### Edge Cases

| Case | Name | Description |
|------|------|-------------|
| 9 | EmptyUserFilter | Empty user filter still applies default filter |
| 10 | NullValuesInFilter | Null values in filter handled correctly |
| 11 | OperatorMerging | Default gt + user lt merge correctly, verifies exact prices [50, 150] |
| 12 | LimitOverride | User limit overrides default limit |
| 13 | OrderPreservation | User order preserved with default filter |

### Security Tests

| Case | Name | Description |
|------|------|-------------|
| 14 | SqlInjectionInFilter | SQL injection payloads safely handled |
| 15 | XssPayloadInFilter | XSS payloads stored and retrieved safely |
| 16 | PrototypePollutionAttempt | Prototype pollution blocked |
| 17 | VeryLongStringValues | 10,000 character strings handled |
| 18 | SpecialCharacters | Special chars (\n\t\r'"\\) preserved |

### Integration Tests

| Case | Name | Description |
|------|------|-------------|
| 19 | TransactionWithDefaultFilter | Default filter works within transaction |
| 20 | RelationsWithDefaultFilter | Default filter works with relation includes |

### Additional Edge Cases

| Case | Name | Description |
|------|------|-------------|
| 21 | UpdateAllWithDefaultFilter | UpdateAll respects default filter |
| 22 | DeleteAllWithDefaultFilter | DeleteAll respects default filter |
| 23 | AndOrCombinationWithDefaultFilter | Complex AND/OR with default filter |
| 24 | DefaultFilterWithFieldSelection | Field selection works with default filter |
| 25 | ConcurrentQueriesWithDefaultFilter | 10 concurrent queries all apply default filter |
| 26 | DefaultFilterWithNestedRelations | Nested relations with default filter |
| 27 | UpdateByIdWithDefaultFilter | UpdateById respects default filter |
| 28 | DefaultFilterInvariance | Original filter object not mutated |

### Advanced Security Tests

| Case | Name | Description |
|------|------|-------------|
| 29 | SqlInjectionInOrderClause | SQL injection in order clause safely handled |
| 30 | SqlInjectionInFieldsArray | SQL injection in fields selection safely handled |
| 31 | SqlInjectionInIncludeRelation | SQL injection in include/relation safely handled |

---

## 6. HiddenPropertiesTestService

Tests for hidden properties filtering (password, secret fields excluded from responses).

| Case | Name | Description |
|------|------|-------------|
| 1 | CreateReturnsHiddenExcluded | Create operation excludes hidden properties from response |
| 2 | FindOperationsExcludeHidden | findOne, find, findById all exclude hidden properties |
| 5 | UpdateByIdExcludesHidden | UpdateById excludes hidden properties from response |
| 6 | DirectConnectorReturnsAll | Direct connector access returns hidden properties |
| 7 | CreateAllExcludesHidden | Batch create excludes hidden properties |
| 8 | UpdateAllExcludesHidden | Batch update excludes hidden properties |
| 9 | HiddenWithInclusion | Hidden exclusion works with relation includes |
| 10 | HiddenWithFieldSelection | Selected fields respected, hidden still excluded |
| 11 | PartialHiddenFields | Only hidden fields excluded, non-hidden returned |
| 12 | HiddenInTransaction | Hidden exclusion works within transactions |
| 13 | FindWithFilterExcludesHidden | Hidden excluded with complex where filters |
| 14 | CountOperationIgnoresHidden | Count works (hidden filtering N/A for counts) |
| 15 | DeleteByIdExcludesHidden | Delete excludes hidden from returned data |
| 16 | DeleteAllExcludesHidden | Batch delete excludes hidden from returned data |
| 18 | MultipleUsersHiddenExcluded | Multiple records all have hidden excluded |
| 19 | HiddenWithPagination | Pagination works with hidden exclusion |
| 20 | Cleanup | Delete all test users |

---

## 7. UserAuditTestService

Tests for automatic user audit tracking (createdBy/modifiedBy fields).

### CREATE Operations

| Case | Name | Description |
|------|------|-------------|
| 1 | CreateWithExplicitAuditFields | Create with explicit createdBy/modifiedBy values |
| 2 | CreateWithoutContext_NullAuditFields | Without Hono context, audit fields are null |
| 3 | CreateAll_BulkAuditFields | Batch create with different audit users for each record |

### UPDATE Operations

| Case | Name | Description |
|------|------|-------------|
| 4 | UpdateById_ModifiedByChanges | modifiedBy changes to updater on UpdateById |
| 5 | UpdateById_CreatedByUnchanged | createdBy remains unchanged after update attempt |
| 6 | UpdateAll_BulkModifiedByChanges | modifiedBy changes for all matching records in batch update |
| 7 | UpdateWithDifferentUser | Multiple updates by different users tracked correctly |

### Edge Cases

| Case | Name | Description |
|------|------|-------------|
| 8 | NullToNonNullAuditFields | Update null audit fields to non-null values |
| 9 | VerifyAuditFieldsStoredInDatabase | Audit fields correctly stored via direct DB query |
| 10 | FilterByAuditFields | Filter/query records by createdBy and modifiedBy |

### Transaction Behavior

| Case | Name | Description |
|------|------|-------------|
| 11 | TransactionAuditTracking | Audit fields work correctly within transactions |
| 12 | RollbackAuditTracking | Rollback restores original audit field values |

### Advanced Scenarios

| Case | Name | Description |
|------|------|-------------|
| 13 | ConcurrentUpdatesModifiedBy | Concurrent updates, last write wins for modifiedBy |
| 14 | AuditFieldsWithRelations | Audit fields accessible with relation includes |
| 15 | MultipleSequentialUpdates | Sequential updates by different users tracked |
| 16 | AuditFieldsDataTypes | Valid User IDs stored correctly (FK constraint enforced) |
| 17 | AuditFieldsInCountAndExists | Count and ExistsWith operations with audit filters |
| 18 | DeleteReturnsAuditFields | Delete operations return records with audit fields |

### Security Tests

| Case | Name | Description |
|------|------|-------------|
| 19 | AuditFieldInjectionAttempt | Malicious inputs rejected by FK constraint |
| 20 | EmptyStringVsNullAuditFields | Empty string rejected, null accepted (FK constraint aware) |
| 21 | Cleanup | Delete all audit test data |

---

## Test Categories

### Functional Coverage

- **CRUD Operations**: Create, Read, Update, Delete (single and batch)
- **Filtering**: Where, Order, Limit, Skip, Fields
- **Transactions**: Commit, Rollback, Isolation Levels
- **Relations**: One-to-Many, Many-to-Many, Nested Inclusions
- **Array Operators**: PostgreSQL `@>`, `<@`, `&&` operators
- **Default Filters**: Automatic query filtering with override
- **Hidden Properties**: Password/secret field exclusion from responses
- **User Audit**: Automatic createdBy/modifiedBy tracking with FK constraints

### Edge Cases

- Null values
- Empty arrays/batches
- Non-existent records
- Boundary values (max/min integers, long strings)
- Concurrent operations
- Empty results

### Security

- SQL Injection prevention
- XSS payload handling
- Prototype pollution protection
- Special character handling

### Performance

- Large batch operations (50+ records)
- Large arrays (100+ elements)
- Concurrent queries (10+ parallel)
- Long string values (10,000+ characters)

---

## Running Tests

Tests are executed when the server starts. To run:

```bash
cd examples/vert
bun run server:dev
```

All test output is logged with PASSED/FAILED status for each case.
