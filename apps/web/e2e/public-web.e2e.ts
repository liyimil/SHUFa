import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const mockApiOrigin = "http://127.0.0.1:3101";
const ouyangCalligrapherId = "22222222-2222-4222-8222-222222222222";

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const summary = results.violations
    .map(
      (violation) =>
        `${violation.id}: ${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")}`,
    )
    .join("\n");
  expect(results.violations, summary).toEqual([]);
}

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${mockApiOrigin}/__test__/reset`);
  expect(response.ok()).toBe(true);
});

test("查字、筛选并打开来源可追溯的范字详情", async ({ page }, testInfo) => {
  await page.goto("/");
  await expectNoAccessibilityViolations(page);
  await page.getByRole("link", { name: "了解 App 练习能力" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(
    page.getByRole("heading", { name: "网页帮你查，App 陪你练" }),
  ).toBeVisible();
  await expect(
    page.getByText("App · 内测准备中", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /下载/ })).toHaveCount(0);
  await expectNoAccessibilityViolations(page);
  await page.getByRole("link", { name: "先在网页查一个字" }).click();

  await page.getByLabel("想查哪个字？").fill("永");
  await page.getByRole("button", { name: "查看名家写法" }).click();

  await expect(page).toHaveURL(/\/characters\/%E6%B0%B8$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "永" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "永字的名家写法" }),
  ).toBeVisible();
  await expectNoAccessibilityViolations(page);
  const filterColumnCount = await page
    .locator(".catalog-filters")
    .evaluate(
      (element) =>
        getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
    );
  expect(filterColumnCount).toBe(
    testInfo.project.name === "mobile-chromium" ? 1 : 4,
  );

  await page.getByLabel("书家").selectOption(ouyangCalligrapherId);
  await page.getByLabel("书体").selectOption("REGULAR");
  await page.getByRole("button", { name: "应用筛选" }).click();

  await expect(page).toHaveURL((url) => {
    return (
      url.searchParams.get("calligrapherId") === ouyangCalligrapherId &&
      url.searchParams.get("scriptStyle") === "REGULAR"
    );
  });
  await expect(page.locator(".glyph-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "欧阳询" })).toBeVisible();
  await expect(page.locator(".source-line")).toContainText(
    "来源：自动化测试夹具",
  );
  await expectNoAccessibilityViolations(page);

  await page.getByRole("link", { name: "查看出处与原帖位置" }).click();
  await expect(page).toHaveURL(
    /\/glyphs\/66666666-6666-4666-8666-666666666666$/,
  );
  await expect(
    page.getByRole("heading", { name: "永 · 欧阳询" }),
  ).toBeVisible();
  await expect(page.getByText(/测试页 1；框选坐标 x=120/)).toBeVisible();
  await expect(page.getByText("仅用于自动化测试的合成夹具")).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test("主动分享在同一 token 被撤销后立即失效", async ({ page, request }) => {
  const token = "e2e-active-share";
  await page.goto(`/shares/${token}`);

  await expect(
    page.getByRole("heading", { level: 1, name: "永" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "练习前后记录" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /次“永”字练习/ })).toHaveCount(2);
  await expectNoAccessibilityViolations(page);

  const revokeResponse = await request.post(
    `${mockApiOrigin}/__test__/shares/${token}/revoke`,
  );
  expect(revokeResponse.ok()).toBe(true);
  await page.reload();

  await expect(page.getByRole("heading", { name: "分享不可用" })).toBeVisible();
  await expect(page.getByText("该分享已过期、被撤销或不存在。")).toBeVisible();
  await expect(page.locator(".attempt-grid")).toHaveCount(0);
  await expectNoAccessibilityViolations(page);
});
