import { emptyContext, latestQuestion, questionKey } from "./interview";

test.each([
  ["Tell me about a difficult project", "Tell me about a difficult project"],
  ["Okay, walk us through your approach", "Okay, walk us through your approach"],
  ["Thanks for joining. Why us?", "Why us?"],
  ["Why this company?", "Why this company?"],
  ["How would you debug that? Take a moment.", "How would you debug that?"],
  ["I built a service. It worked well.", ""],
  ["Thanks", ""],
])("detects interviewer prompts: %s", (text, expected) => expect(latestQuestion(text)).toBe(expected));

test("detects a new question after a long transcript has filled the rolling context", () => {
  expect(latestQuestion("Earlier conversation. ".repeat(2000) + "Explain eventual consistency")).toBe("Explain eventual consistency");
  expect(questionKey(" Why   this Company? ")).toBe(questionKey("why this company"));
  expect(emptyContext()).not.toBe(emptyContext());
});
