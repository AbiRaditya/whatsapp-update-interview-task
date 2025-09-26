module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.(t|j)sx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  roots: ["<rootDir>/src-ts", "<rootDir>/tests-ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  // Note: Previously mapped .js to .ts for internal ESM-style imports. Removed because it interfered with dependencies (e.g. react-is).
};
