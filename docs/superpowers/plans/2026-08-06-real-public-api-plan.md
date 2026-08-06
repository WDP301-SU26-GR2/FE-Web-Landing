# Real Public API Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển Guest Reader UI sang dữ liệu public API thật theo `FE-Web-Guide`, loại bỏ nguồn magazine suy diễn và placeholder nghiệp vụ giả.

**Architecture:** Giữ `publicApi` làm lớp gọi REST. App gọi `/vote/periods/open` theo flow Guest và truyền payload kỳ mở xuống RankingPanel; panel chỉ render các magazine có trong response thật. Các component chỉ render payload API hoặc empty state trung tính.

**Tech Stack:** React, Vite, Vitest, Fetch API.

## Global Constraints

- `FE-Web-Guide` là nguồn contract ưu tiên cho Guest Reader.
- Không thêm mock/fake/fixture/fallback dữ liệu nghiệp vụ vào production code.
- Không hard-code magazine hoặc giới hạn vote; lấy từ API.
- Chỉ dùng URL ảnh đã ký từ public API.

---

### Task 1: Open-period magazine discovery

**Files:**
- Modify: `src/utils/guest-flow.js`, `src/main.jsx`
- Test: `src/utils/guest-flow.test.js`

**Interfaces:**
- Produces `getMagazineOptions(openPeriods): string[]`.

- [ ] **Step 1: Write the failing test**

```js
it("returns every unique magazine from open Guest vote periods", () => {
  expect(getMagazineOptions([{ magazine: "Ko có" }, { magazine: "AuraNVC" }]))
    .toEqual(["AuraNVC", "Ko có"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/api/public.service.test.js`
Expected: FAIL because `getMagazineOptions` does not exist.

- [ ] **Step 3: Write minimal implementation**

Read `data.items` from the existing `/vote/periods/open` request, trim/filter non-empty magazine values, deduplicate and sort; pass the loaded periods from App to RankingPanel.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/api/public.service.test.js`
Expected: PASS.

### Task 2: Use API-discovered magazines and remove fake display data

**Files:**
- Modify: `src/components/RankingPanel.jsx`, `src/main.jsx`
- Test: `src/api/public.service.test.js`

**Interfaces:**
- RankingPanel owns `magazines` loading and renders API errors/empty states.

- [ ] **Step 1: Write the failing test**

Extend the component flow to use a native select populated by the open-period magazine options and preserve documented ranking query serialization.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/api/public.service.test.js`
Expected: FAIL on the new discovery behavior.

- [ ] **Step 3: Write minimal implementation**

Remove the catalog-derived magazine prop and the datalist. Pass `openVotePeriods` from App, render every option in a native select, and keep neutral missing-data labels for non-business placeholders.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/api/public.service.test.js src/utils/guest-flow.test.js`
Expected: PASS.

### Task 3: Full verification

**Files:**
- Verify: `src/**`, `dist/**`

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: exit code 0 and no failed tests.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: exit code 0.

- [ ] **Step 3: Scan production sources and bundle**

Run: `rg -n -i "mock|fake|dummy|fixture|demo|hardcod|Stories that stay|ISSUE 07|Tác giả Kirameki" src dist`
Expected: no runtime mock/demo data matches.
