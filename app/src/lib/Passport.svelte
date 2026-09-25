<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		credential,
		identity,
		submitAction,
		options
	}: { credential: Snippet; identity: Snippet; submitAction: Snippet; options: Snippet } = $props();
</script>

<article class="passport" aria-label="Concierge passport">
	<div class="credential-page">
		<header class="passport-band">
			<span class="brand-mark" aria-hidden="true">✦</span>
			<span>CONCIERGE</span>
		</header>
		<div class="credential-content">
			<p class="margin-note">CREDENTIALS & STAMPS</p>
			<div class="credential-box">
				<p class="credential-title">ACCESS CREDENTIAL</p>
				{@render credential()}
			</div>
			<div class="credential-action">{@render submitAction()}</div>
		</div>
	</div>

	<div class="fold" aria-hidden="true"></div>

	<div class="identity-page">
		<div class="identity-main">
			<header class="identity-head">
				<span class="brand-mark" aria-hidden="true">✦</span>
				<span>CONCIERGE<br /><strong>PASSPORT</strong></span>
				<span class="passport-number">CG001</span>
			</header>
			<div class="identity-grid">
				<div class="portrait" aria-hidden="true">
					<div class="portrait-art">
						<i class="portrait-head"></i><i class="portrait-shoulders"></i>
					</div>
					<span>GUEST PHOTO</span>
				</div>
				<div class="passport-fields">{@render identity()}</div>
			</div>
			{@render options()}
		</div>
		<footer class="machine-line" aria-hidden="true">
			<span>P&lt;PP&lt;CONCIERGE&lt;TABLES&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</span>
			<span>CG001&lt;YOUR&lt;NEXT&lt;TABLE&lt;&lt;&lt;&lt;&lt;&lt;&lt;</span>
		</footer>
	</div>
</article>

<style>
	.passport {
		display: grid;
		grid-template-rows: minmax(0, 1fr) 0.7rem minmax(0, 1fr);
		overflow: hidden;
		width: min(100%, 21.375rem);
		aspect-ratio: 7 / 10;
		margin-inline: auto;
		border: 1px solid #ded7c9;
		border-radius: 10px;
		background: #f9f7f1;
		color: #191817;
		box-shadow: 0 24px 60px rgb(0 0 0 / 22%);
	}

	.credential-page,
	.identity-page {
		display: flex;
		min-height: 0;
		flex-direction: column;
	}

	.credential-page {
		background: linear-gradient(135deg, #f8f5ed, #eee8dc);
	}

	.passport-band {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.55rem 0.8rem;
		border-bottom: 1px solid #d2cabc;
		font-size: 0.57rem;
		font-weight: 700;
		letter-spacing: 0.1em;
	}

	.brand-mark {
		color: #ad4c26;
		font-size: 1.15rem;
		line-height: 1;
	}

	.credential-content {
		position: relative;
		display: flex;
		min-height: 0;
		flex: 1;
		align-items: safe center;
		overflow-y: auto;
		padding: 0.5rem 4rem 0.5rem 1.6rem;
	}

	.margin-note {
		position: absolute;
		left: 0.55rem;
		top: 50%;
		color: #777166;
		font-size: 0.43rem;
		letter-spacing: 0.12em;
		white-space: nowrap;
		transform: translate(-50%, -50%) rotate(-90deg);
	}

	.credential-box {
		width: 100%;
		padding: 0.55rem 0.7rem;
		border: 1px solid #bb5c39;
		transform: rotate(-1deg);
	}

	.credential-title {
		color: #ae4c28;
		font-size: 0.63rem;
		font-weight: 800;
		letter-spacing: 0.1em;
	}

	.credential-action {
		position: absolute;
		right: 0.65rem;
		bottom: 0.8rem;
	}

	.fold {
		border-top: 1px solid #beb5a6;
		border-bottom: 1px solid #cfc7ba;
		background: linear-gradient(#bcb3a6, #f9f7f1 44%, #dfd9cf);
		box-shadow: inset 0 2px 4px rgb(0 0 0 / 12%);
	}

	.identity-main {
		display: flex;
		min-height: 0;
		flex: 1;
		flex-direction: column;
		justify-content: safe center;
		overflow-y: auto;
		padding: 0.35rem 0.8rem;
	}

	.identity-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.45rem;
		letter-spacing: 0.08em;
		line-height: 1.1;
	}

	.identity-head strong {
		font-size: 0.65rem;
	}

	.passport-number {
		margin-left: auto;
		color: #ad4c26;
		font-size: 0.7rem;
		font-weight: 800;
	}

	.identity-grid {
		display: grid;
		grid-template-columns: 5.7rem minmax(0, 1fr);
		gap: 0.65rem;
		margin-top: 0.3rem;
	}

	.portrait-art {
		position: relative;
		overflow: hidden;
		aspect-ratio: 0.9;
		background: #1b1b19;
	}

	.portrait-head {
		position: absolute;
		top: 18%;
		left: 50%;
		width: 35%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: #e7e0d2;
		transform: translateX(-50%);
	}

	.portrait-shoulders {
		position: absolute;
		right: 10%;
		bottom: -10%;
		left: 10%;
		height: 52%;
		border-radius: 50% 50% 0 0;
		background: #e7e0d2;
	}

	.portrait span {
		display: block;
		margin-top: 0.25rem;
		color: #777166;
		font-size: 0.37rem;
		letter-spacing: 0.08em;
		text-align: center;
	}

	.machine-line {
		display: grid;
		gap: 0.1rem;
		overflow: hidden;
		padding: 0.4rem 0.8rem;
		border-top: 1px solid #cfc6b8;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.55rem;
		letter-spacing: 0.07em;
		line-height: 1.2;
		white-space: nowrap;
	}

	@media (min-width: 640px) {
		.passport {
			width: min(100%, 25rem);
		}
	}

	@media (min-width: 1280px) {
		.passport {
			width: min(100%, 27rem);
		}
	}

	@media (max-width: 420px) {
		.credential-content {
			padding-right: 3.5rem;
		}

		.identity-grid {
			grid-template-columns: 3.5rem minmax(0, 1fr);
			gap: 0.5rem;
		}
	}

	@media (max-width: 359px) {
		.passport {
			height: 30rem;
			aspect-ratio: auto;
		}

		.credential-content {
			padding-right: 3rem;
		}
	}
</style>
