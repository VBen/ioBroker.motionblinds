import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
	{
		ignores: ["build/**", "admin/words.js"],
	},
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
				project: "./tsconfig.json",
			},
		},
		plugins: {
			"@typescript-eslint": tsPlugin,
		},
		rules: {
			...tsPlugin.configs.recommended.rules,
			"indent": ["error", "tab", { "SwitchCase": 1 }],
			"quotes": [
				"error",
				"double",
				{ "avoidEscape": true, "allowTemplateLiterals": true },
			],
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-use-before-define": [
				"error",
				{ functions: false, typedefs: false, classes: false },
			],
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ ignoreRestSiblings: true, argsIgnorePattern: "^_" },
			],
			"@typescript-eslint/explicit-function-return-type": [
				"warn",
				{ allowExpressions: true, allowTypedFunctionExpressions: true },
			],
			"@typescript-eslint/no-non-null-assertion": "off",
			"no-var": "error",
			"prefer-const": "error",
			"no-trailing-spaces": "error",
		},
	},
	{
		files: ["src/**/*.test.ts"],
		rules: {
			"@typescript-eslint/explicit-function-return-type": "off",
		},
	},
];
