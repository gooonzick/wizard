declare module "*.svelte" {
	const component: import("svelte").Component<Record<string, unknown>>;
	export default component;
}
