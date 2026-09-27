/**
 * Sidebar: custom menu is gone; assistants and connectors talk to the API;
 * entries without a backend stay disabled.
 *
 * Ways this can fail:
 *   S1 「自定义菜单」 is still a button.
 *   S2 「助理」 is disabled and labeled 未接入, so the create form never opens.
 *   S3 creating an assistant does not show the saved name (request failed or the list was not reloaded).
 *   S4 an empty name is sent to the server.
 *   S5 「项目」 becomes a link.
 *   S9 「技能」 stays disabled, or the page calls something other than the local catalog.
 *   S10 a skill card offers 安装, or the detail says the package will be installed.
 *   S11 search hides the matching skill or keeps a skill that does not match.
 *   S12 opening a skill stays in a dialog, or the detail page does not show the stored row.
 *   S13 a skill with no author stays on the list, or the file tab does not show saved text.
 *   S6 a connector can be saved without a command.
 *   S7 the connector form has a password field, or accepts KEY=value as an env name.
 *   S8 after leaving and coming back, the assistant created in this session is gone.
 */
import { expect, test } from "./test";

test("assistants and connectors are usable; unfinished entries stay grey", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "自定义菜单" })).toHaveCount(0); // S1
  await expect(page.getByRole("link", { name: "助理" })).toBeVisible(); // S2
  await expect(page.getByRole("button", { name: "项目 · 未接入" })).toBeDisabled(); // S5
  await expect(page.getByRole("button", { name: "专家 · 未接入" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "技能" })).toBeVisible();
  await expect(page.getByRole("button", { name: "定时任务 · 未接入" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "资料库 · 未接入" })).toBeDisabled();

  await page.getByRole("link", { name: "助理" }).click();
  await expect(page.getByRole("heading", { name: "助理" })).toBeVisible();
  await page.getByRole("button", { name: "创建助理" }).click();
  await expect(page.getByText("请填写助理名称")).toBeVisible(); // S4
  await page.getByLabel("助理名称").fill("周报助理");
  await page.getByLabel("助理说明").fill("每周五汇总本周进展");
  await page.getByRole("button", { name: "创建助理" }).click();
  await expect(page.getByText("周报助理")).toBeVisible(); // S3
  await expect(page.getByText("每周五汇总本周进展")).toBeVisible();

  await page.getByRole("link", { name: "新建任务" }).click();
  await page.getByRole("link", { name: "助理" }).click();
  await expect(page.getByText("周报助理")).toBeVisible(); // S8

  await page.getByRole("link", { name: "连接器" }).click();
  await expect(page.getByRole("heading", { name: "连接器" })).toBeVisible();
  await expect(page.locator("input[type=password]")).toHaveCount(0); // S7
  await page.getByRole("button", { name: "添加连接器" }).click();
  await expect(page.getByText("请填写名称和启动命令")).toBeVisible(); // S6
  await page.getByLabel("连接器名称").fill("文档");
  await page.getByLabel("启动命令").fill("npx");
  await page.getByLabel("启动参数").fill("-y docs");
  await page.getByLabel("环境变量名").fill("DOCS_TOKEN=secret");
  await page.getByRole("button", { name: "添加连接器" }).click();
  await expect(page.getByText("环境变量只填名字，不要填写密钥")).toBeVisible(); // S7
  await page.getByLabel("环境变量名").fill("DOCS_TOKEN");
  await page.getByRole("button", { name: "添加连接器" }).click();
  await expect(page.getByText("文档")).toBeVisible();
  await expect(page.getByText("环境变量名：DOCS_TOKEN")).toBeVisible();
  await expect(page.getByText("secret")).toHaveCount(0);

  await page.getByRole("link", { name: "技能" }).click();
  await expect(page.getByRole("heading", { name: "技能" })).toBeVisible();
  await expect(page.getByText("只展示，不安装")).toBeVisible(); // S9
  await expect(page.getByRole("link", { name: /周报汇总/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /代码审查/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "安装" })).toHaveCount(0); // S10
  await page.getByLabel("搜索技能").fill("周报");
  await expect(page.getByRole("link", { name: /周报汇总/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /代码审查/ })).toHaveCount(0); // S11
  await page.getByLabel("搜索技能").fill("");
  await page.getByRole("button", { name: "近期飙升" }).click();
  await expect(page.getByRole("link", { name: /周报汇总/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /代码审查/ })).toHaveCount(0);
  await page.getByRole("link", { name: /周报汇总/ }).click();
  await expect(page).toHaveURL(/\/experts\/skills\/demo\/weekly$/); // S12
  await expect(page.getByRole("heading", { name: "周报汇总" })).toBeVisible();
  await expect(page.getByText("@demo/weekly")).toBeVisible();
  await expect(page.getByText("不会安装技能")).toBeVisible(); // S10
  await expect(page.getByRole("link", { name: /会议纪要/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "安装" })).toHaveCount(0);
  await page.getByRole("tab", { name: "文件" }).click();
  await expect(page.getByText("SKILL.md")).toBeVisible();
  await expect(page.getByText("周报技能说明正文")).toBeVisible(); // S13
  await page.getByRole("link", { name: "返回技能目录" }).click();
  await page.getByRole("link", { name: /随手笔记/ }).click();
  await expect(page).toHaveURL(/\/experts\/skills\/notes$/); // S13
  await expect(page.getByRole("heading", { name: "随手笔记" })).toBeVisible();
  await page.getByRole("tab", { name: "文件" }).click();
  await expect(page.getByText("没有作者的技能说明")).toBeVisible();
});
