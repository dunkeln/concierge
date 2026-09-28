<script lang="ts">
	import { tick } from 'svelte';

	type Session = {
		id: string;
		venue: string;
		viewPath: string;
		image?: string;
	};

	let { sessions }: { sessions: Session[] } = $props();
	let expanded = $state(false);
	let trigger = $state<HTMLButtonElement>();
	let close = $state<HTMLButtonElement>();
	let dialog = $state<HTMLDialogElement>();
	let latest = $derived(sessions.at(-1));

	async function open() {
		expanded = true;
		await tick();
		dialog?.showModal();
		close?.focus();
	}

	async function dismiss() {
		dialog?.close();
		expanded = false;
		await tick();
		trigger?.focus();
	}
</script>

<div class="preview-trigger" class:stacked={sessions.length > 1}>
	<div class="preview-thumbnail" aria-hidden="true">
		{#if latest?.image}
			<img src={latest.image} alt="" />
		{/if}
	</div>
	<button
		bind:this={trigger}
		type="button"
		class="preview-open"
		aria-label="Open live reservation browser"
		aria-haspopup="dialog"
		onclick={open}
	></button>
	<span class="live-indicator" aria-hidden="true"></span>
</div>

{#if expanded}
	<dialog
		bind:this={dialog}
		class="preview-overlay"
		aria-label="Live reservation browser"
		oncancel={(event) => {
			event.preventDefault();
			void dismiss();
		}}
	>
		<button
			type="button"
			class="preview-backdrop"
			aria-label="Close live reservation browser"
			tabindex="-1"
			onclick={dismiss}
		></button>
		<div class="preview-rail" role="group" aria-label="Live reservation browser views">
			{#each sessions as session (session.id)}
				<div class="preview-window" class:is-ready={!!session.image}>
					<div class="preview-shimmer" aria-hidden="true"></div>
					{#if !session.image}
						<span class="sr-only" role="status">Loading live reservation browser</span>
					{/if}
					{#if session.image}
						<img src={session.image} alt={`Browser inspection of ${session.venue}`} />
					{/if}
				</div>
			{/each}
		</div>
		{#if latest}
			<a
				tabindex="0"
				href={latest.viewPath}
				target="_blank"
				rel="noopener noreferrer"
				class="absolute top-6 left-6 text-sm text-white/75 underline underline-offset-4"
				>Open in a tab</a
			>
		{/if}
		<button
			bind:this={close}
			tabindex="0"
			type="button"
			class="preview-close"
			aria-label="Close live reservation browser"
			onclick={dismiss}
		>
			<svg
				viewBox="0 0 24 24"
				aria-hidden="true"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
			>
				<path d="M6 6l12 12M18 6L6 18" />
			</svg>
		</button>
	</dialog>
{/if}

<style>
	.preview-trigger {
		position: relative;
		width: 9rem;
		height: 6rem;
		isolation: isolate;
	}
	.preview-trigger.stacked::before,
	.preview-trigger.stacked::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 1.25rem;
		background: #262626;
		box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12);
	}
	.preview-trigger.stacked::before {
		transform: translate(0.55rem, -0.35rem) rotate(3deg);
		z-index: -2;
	}
	.preview-trigger.stacked::after {
		transform: translate(0.25rem, -0.2rem) rotate(1deg);
		z-index: -1;
	}
	.preview-thumbnail {
		width: 100%;
		height: 100%;
		overflow: hidden;
		border-radius: 1.25rem;
		background: #1c1c1c;
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.16),
			0 12px 32px rgb(0 0 0 / 0.28);
	}
	.preview-thumbnail img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.preview-open {
		position: absolute;
		inset: 0;
		border-radius: 1.25rem;
		cursor: pointer;
	}
	.preview-open:focus-visible,
	.preview-close:focus-visible {
		outline: 2px solid white;
		outline-offset: 3px;
	}
	.live-indicator {
		position: absolute;
		right: 0.65rem;
		bottom: 0.65rem;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: #f5f5f5;
		box-shadow: 0 0 0 3px rgb(0 0 0 / 0.55);
		pointer-events: none;
	}
	.preview-overlay {
		width: 100%;
		height: 100dvh;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		background: rgb(0 0 0 / 0.92);
		backdrop-filter: blur(18px);
	}
	.preview-backdrop {
		position: absolute;
		inset: 0;
	}
	.preview-rail {
		position: relative;
		display: flex;
		width: 100%;
		gap: 1rem;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		padding: 0 max(4vw, calc((100vw - 1100px) / 2));
		scroll-snap-type: x mandatory;
		scrollbar-width: none;
	}
	.preview-rail::-webkit-scrollbar {
		display: none;
	}
	.preview-window {
		position: relative;
		flex: 0 0 min(92vw, 1100px);
		height: min(78dvh, 760px);
		overflow: hidden;
		border-radius: 1.75rem;
		background: #1c1c1c;
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.12),
			0 32px 80px rgb(0 0 0 / 0.45);
		scroll-snap-align: center;
	}
	.preview-shimmer {
		/* Gradient sweep adapted from transitions.dev/transitions/shimmer-text/. */
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
		background: linear-gradient(90deg, #202020 35%, #363636 50%, #202020 65%);
		background-size: 400% 100%;
		animation: preview-shimmer 2s linear infinite;
		transition: opacity 400ms ease-in-out;
	}
	.is-ready .preview-shimmer {
		opacity: 0;
	}
	@keyframes preview-shimmer {
		from {
			background-position: 100% 0;
		}
		to {
			background-position: 0 0;
		}
	}
	.preview-window img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		pointer-events: none;
	}
	.preview-close {
		position: absolute;
		top: max(1rem, env(safe-area-inset-top));
		right: max(1rem, env(safe-area-inset-right));
		display: grid;
		width: 2.75rem;
		height: 2.75rem;
		place-items: center;
		border-radius: 50%;
		background: rgb(255 255 255 / 0.14);
		color: white;
		cursor: pointer;
		backdrop-filter: blur(12px);
	}
	.preview-close svg {
		width: 1.1rem;
		height: 1.1rem;
	}
	@media (prefers-reduced-motion: reduce) {
		.preview-shimmer {
			animation: none;
			transition: none;
		}
	}
	@media (max-width: 640px) {
		.preview-rail {
			padding-inline: 4vw;
		}
		.preview-window {
			height: 72dvh;
			border-radius: 1.35rem;
		}
	}
</style>
