import { inferSemanticMutationClass, isMutationClassCompatible } from "../mutationClassifier"

describe("mutationClassifier", () => {
	it("classifies whitespace/comment-only changes as AST_REFACTOR", () => {
		const oldContent = `export function sum(a:number,b:number){return a+b}`
		const newContent = `
		// keep API same
		export function sum(a: number, b: number) {
			return a + b
		}
		`
		const inferred = inferSemanticMutationClass({
			filePath: "src/math.ts",
			oldContent,
			newContent,
		})
		expect(inferred).toBe("AST_REFACTOR")
	})

	it("classifies semicolon-only edits as AST_REFACTOR", () => {
		const oldContent = `export const x = 1; export function inc(v:number){ return v + x; }`
		const newContent = `export const x = 1 export function inc(v:number){ return v + x }`
		const inferred = inferSemanticMutationClass({
			filePath: "src/math.ts",
			oldContent,
			newContent,
		})
		expect(inferred).toBe("AST_REFACTOR")
	})

	it("classifies new exported symbol as INTENT_EVOLUTION", () => {
		const oldContent = `export function auth(req:any){ return !!req }`
		const newContent = `
      export function auth(req:any){ return !!req }
      export function login(user:string){ return user.length > 0 }
    `
		const inferred = inferSemanticMutationClass({
			filePath: "src/auth.ts",
			oldContent,
			newContent,
		})
		expect(inferred).toBe("INTENT_EVOLUTION")
	})

	it("classifies exported signature changes as INTENT_EVOLUTION", () => {
		const oldContent = `export function auth(user:string){ return Boolean(user) }`
		const newContent = `export function auth(user:string, token:string){ return Boolean(user) && Boolean(token) }`
		const inferred = inferSemanticMutationClass({
			filePath: "src/auth.ts",
			oldContent,
			newContent,
		})
		expect(inferred).toBe("INTENT_EVOLUTION")
	})

	it("fails safe on mismatch compatibility", () => {
		expect(isMutationClassCompatible("modify", "AST_REFACTOR")).toBe(false)
		expect(isMutationClassCompatible("AST_REFACTOR", "AST_REFACTOR")).toBe(true)
	})
})
