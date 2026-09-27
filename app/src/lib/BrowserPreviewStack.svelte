<script lang="ts">
	type Session = {
		id: string;
		venue: string;
		viewPath: string;
		state: 'open' | 'closed';
	};

	let { sessions }: { sessions: Session[] } = $props();
	let hovered = $state(false);
	let pinned = $state(false);
	let focused = $state(false);
	let expanded = $derived(hovered || pinned || focused);
</script>

<section
	class="browser-stack"
	class:expanded
	aria-label="Reservation browser activity"
	onpointerenter={() => (hovered = true)}
	onpointerleave={() => (hovered = false)}
	onfocusin={() => (focused = true)}
	onfocusout={(event) => {
		if (
			!(event.relatedTarget instanceof Node) ||
			!event.currentTarget.contains(event.relatedTarget)
		)
			focused = false;
	}}
>
	<button
		type="button"
		class="stack-toggle"
		aria-expanded={expanded}
		onclick={() => (pinned = !pinned)}
	>
		<span>Browser activity</span>
		<span class="text-primary-foreground/55"
			>{sessions.filter((session) => session.state === 'open').length} live · {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</span
		>
	</button>
	<div class="browser-rail" aria-hidden={!expanded}>
		{#each sessions as session, index (session.id)}
			<article class="browser-card" style={`--stack-index: ${index}`}>
				<div class="card-header">
					<span class="truncate">{session.venue}</span>
					<span class="shrink-0 text-primary-foreground/55"
						>{session.state === 'open' ? 'Live · SevenRooms' : 'Finished · SevenRooms'}</span
					>
				</div>
				{#if session.state === 'open' && expanded}
					<iframe
						src={session.viewPath}
						title={`Live SevenRooms search for ${session.venue}`}
						tabindex="-1"
						referrerpolicy="no-referrer"
						class="pointer-events-none h-60 w-full border-0 bg-secondary"
					></iframe>
				{:else if expanded}
					<p class="px-3 py-8 text-center text-xs text-primary-foreground/55">
						The live browser session has ended.
					</p>
				{/if}
			</article>
		{/each}
	</div>
</section>

<style>
	.browser-stack {
		position: relative;
		width: 11rem;
		height: 6.5rem;
		transition:
			width 240ms ease,
			height 240ms ease;
	}
	.browser-stack.expanded {
		width: 100%;
		height: 21rem;
	}
	.stack-toggle {
		position: relative;
		z-index: 10;
		display: flex;
		width: 100%;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
		font-size: 0.75rem;
		text-align: left;
	}
	.browser-rail {
		position: absolute;
		inset: 2rem 0 0;
		overflow: hidden;
	}
	.browser-card {
		position: absolute;
		top: calc(var(--stack-index) * 0.4rem);
		left: calc(var(--stack-index) * 0.45rem);
		z-index: calc(5 - var(--stack-index));
		width: 10rem;
		min-height: 3.5rem;
		overflow: hidden;
		border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
		border-radius: 1rem;
		background: var(--secondary);
	}
	.card-header {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.65rem;
		font-size: 0.7rem;
	}
	.expanded .browser-rail {
		display: flex;
		gap: 0.75rem;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.expanded .browser-rail::-webkit-scrollbar {
		display: none;
	}
	.expanded .browser-card {
		position: relative;
		top: auto;
		left: auto;
		flex: 0 0 min(24rem, 85vw);
		width: min(24rem, 85vw);
		min-height: 0;
	}
	.expanded .card-header {
		flex-direction: row;
		justify-content: space-between;
	}
	@media (prefers-reduced-motion: reduce) {
		.browser-stack {
			transition: none;
		}
	}
</style>
