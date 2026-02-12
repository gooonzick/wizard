import { defineConfig } from "vitepress";
import llmstxt from 'vitepress-plugin-llms'

export default defineConfig({
	title: "WizardForm",
	description: "Declarative, type-safe wizard framework for TypeScript",
	base: process.env.NODE_ENV === "production" ? "/wizard/" : "/",
	lang: "en-US",

	lastUpdated: true,
	cleanUrls: true,

	vite: {
		plugins: [llmstxt() as never],
	},


	themeConfig: {
		logo: "🧙",

		nav: [
			{ text: "Guide", link: "/guide/getting-started" },
			{ text: "React Integration", link: "/guide/react-integration" },
			{ text: "Vue Integration", link: "/guide/vue-integration" },
			{ text: "API", link: "/guide/api/core" },
			{ text: "CI/CD", link: "/guide/ci-cd" },
		],

		sidebar: {
			"/guide/": [
				{
					text: "Guide",
					items: [
						{ text: "Getting Started", link: "/guide/getting-started" },
						{ text: "Core Concepts", link: "/guide/core-concepts" },
						{ text: "Defining Wizards", link: "/guide/defining-wizards" },
					],
				},
				{
					text: "Framework Integrations",
					items: [
						{ text: "React Integration", link: "/guide/react-integration" },
						{ text: "Vue Integration", link: "/guide/vue-integration" },
					],
				},
				{
					text: "API Reference",
					items: [
						{ text: "Core API", link: "/guide/api/core" },
						{ text: "React API", link: "/guide/api/react" },
						{ text: "Vue API", link: "/guide/api/vue" },
					],
				},
				{
					text: "Development",
					items: [{ text: "CI/CD", link: "/guide/ci-cd" }],
				},
			],
		},

		search: {
			provider: "local",
		},

		socialLinks: [
			{ icon: "github", link: "https://github.com/gooonzick/wizard" },
		],

		editLink: {
			pattern:
				"https://github.com/gooonzick/wizard/edit/main/packages/docs/:path",
			text: "Edit on GitHub",
		},

		footer: {
			message: "Released under the MIT License.",
			copyright: "Copyright © 2026-present WizardForm contributors",
		},
	},
});
