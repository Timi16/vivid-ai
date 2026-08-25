import { extractHtmlArtifact, slugify, titleOf } from "@/features/chat/lib/artifacts";

const doc =
  "<!doctype html>\n<html><head><title> Lagos  Café </title></head><body>hi</body></html>";

describe("extractHtmlArtifact", () => {
  it("finds a complete html fence with the text around it", () => {
    const reply = `Here is your page.\n\n\`\`\`html\n${doc}\n\`\`\`\n\nIt has a hero and a menu.`;
    const found = extractHtmlArtifact(reply);
    expect(found).not.toBeNull();
    expect(found!.complete).toBe(true);
    expect(found!.html).toBe(doc);
    expect(found!.title).toBe("Lagos Café");
    expect(found!.before).toBe("Here is your page.");
    expect(found!.after).toBe("It has a hero and a menu.");
  });

  it("reports an open fence while the reply is still streaming", () => {
    const found = extractHtmlArtifact(
      "Building it now.\n```html\n<!doctype html>\n<html><head><ti"
    );
    expect(found).not.toBeNull();
    expect(found!.complete).toBe(false);
    expect(found!.html).toContain("<html><head><ti");
    expect(found!.after).toBe("");
    expect(found!.title).toBe("Website");
  });

  it("accepts an untagged fence that starts like a document", () => {
    const found = extractHtmlArtifact("```\n<html><body>x</body></html>\n```");
    expect(found?.html).toBe("<html><body>x</body></html>");
  });

  it("skips other languages and returns null when there is no html", () => {
    expect(extractHtmlArtifact("```python\nprint(1)\n```")).toBeNull();
    expect(extractHtmlArtifact("plain text")).toBeNull();
  });

  it("finds html after an earlier non-html block", () => {
    const found = extractHtmlArtifact("```js\nconst a = 1;\n```\n\n```html\n<html></html>\n```");
    expect(found?.html).toBe("<html></html>");
    expect(found?.before).toContain("const a = 1;");
  });

  it("does not treat ``` inside the html as the closing fence unless it starts a line", () => {
    const found = extractHtmlArtifact("```html\n<p>use ``` in markdown</p>\n```\nafter");
    expect(found?.html).toBe("<p>use ``` in markdown</p>");
    expect(found?.after).toBe("after");
  });
});

describe("titleOf and slugify", () => {
  it("falls back when there is no title", () => {
    expect(titleOf("<html></html>")).toBe("Website");
  });

  it("makes a safe filename stem", () => {
    expect(slugify("Lagos Café: Landing Page!")).toBe("lagos-cafe-landing-page");
    expect(slugify("   ")).toBe("website");
  });
});
