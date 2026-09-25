import { render } from "solid-js/web";
import { App } from "./App";
import "./app.css";

const target = document.getElementById("app");
if (!target) {
	throw new Error("#app container is missing from index.html");
}

render(() => <App />, target);
