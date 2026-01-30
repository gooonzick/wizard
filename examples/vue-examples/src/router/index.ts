import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: "/:pathMatch(.*)*",
			name: "catch-all",
			redirect: "/",
		},
	],
});

export default router;
