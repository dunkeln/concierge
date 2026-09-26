<script lang="ts">
	import { enhance } from '$app/forms';
	import Passport from '$lib/Passport.svelte';
	import type { PageProps } from './$types';

	let { form, data }: PageProps = $props();
	let registering = $state(false);
</script>

<svelte:head><title>Sign in — Concierge</title></svelte:head>

{#snippet credential()}
	<h1 class="credential-heading">{registering ? 'Create your passport' : 'Sign in'}</h1>
	<div class="credential-fields">
		<div class="passport-field">
			<label for="email">Email address</label>
			<input
				id="email"
				name="email"
				type="email"
				autocomplete="email"
				required
				placeholder="you@example.com"
				class="passport-input"
			/>
		</div>
		<div class="passport-field">
			<label for="password">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete={registering ? 'new-password' : 'current-password'}
				required
				placeholder="Password"
				class="passport-input"
			/>
		</div>
		{#if form?.message}<p role="alert" class="form-error">{form.message}</p>{/if}
	</div>
{/snippet}

{#snippet identity()}
	<div class="identity-details">
		<p class="record-number">GUEST RECORD / 01</p>
		{#if registering}
			<div class="passport-field">
				<label for="name">Full name</label>
				<input
					id="name"
					name="name"
					type="text"
					autocomplete="name"
					required
					placeholder="Your name"
					class="passport-input"
				/>
			</div>
		{:else}
			<p class="identity-value">GOOD PLACES AHEAD</p>
		{/if}
		<div class="identity-facts">
			<p><span>PASS TYPE</span><strong>GUEST</strong></p>
			<p><span>ENTRIES</span><strong>MULTIPLE</strong></p>
		</div>
	</div>
{/snippet}

{#snippet submitAction()}
	<button
		class="submit-action"
		type="submit"
		aria-label={registering ? 'Create account' : 'Sign in'}
	>
		<span aria-hidden="true">→</span>
	</button>
{/snippet}

{#snippet options()}
	<div class="passport-options">
		<p class="switch-mode">
			{registering ? 'Already have an account?' : 'New to Concierge?'}
			<button type="button" onclick={() => (registering = !registering)}>
				{registering ? 'Sign in' : 'Create an account'}
			</button>
		</p>
		{#if data.githubEnabled}
			<button class="social-action" type="submit" form="github-sign-in">
				Continue with GitHub <span aria-hidden="true">→</span>
			</button>
		{/if}
		{#if data.googleEnabled}
			<button class="social-action" type="submit" form="google-sign-in">
				Continue with Google <span aria-hidden="true">→</span>
			</button>
		{/if}
		{#if data.appleEnabled}
			<button class="social-action" type="submit" form="apple-sign-in">
				Continue with Apple <span aria-hidden="true">→</span>
			</button>
		{/if}
	</div>
{/snippet}

<main
	class="login-page grid min-h-screen grid-cols-[minmax(0,1fr)] bg-primary text-primary-foreground lg:grid-cols-2"
>
	<section
		class="order-last flex flex-col px-6 pt-6 pb-12 sm:px-12 lg:order-first lg:min-h-screen lg:px-16 lg:py-6 xl:px-24"
	>
		<div class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center lg:py-3">
			<form method="post" action={registering ? '?/signUpEmail' : '?/signInEmail'} use:enhance>
				<Passport {credential} {identity} {submitAction} {options} />
			</form>
			{#if data.githubEnabled}
				<form id="github-sign-in" method="post" action="?/signInSocial">
					<input type="hidden" name="provider" value="github" />
				</form>
			{/if}
			{#if data.googleEnabled}
				<form id="google-sign-in" method="post" action="?/signInSocial">
					<input type="hidden" name="provider" value="google" />
				</form>
			{/if}
			{#if data.appleEnabled}
				<form id="apple-sign-in" method="post" action="?/signInSocial">
					<input type="hidden" name="provider" value="apple" />
				</form>
			{/if}
		</div>
	</section>
	<aside
		class="art-surface order-first flex min-h-[340px] flex-col justify-center overflow-hidden px-6 py-8 sm:px-12 lg:order-last lg:min-h-screen lg:px-16"
		aria-label="Concierge editorial artwork"
	>
		<div
			class="relative z-10 mx-auto h-[280px] w-full max-w-[360px] sm:h-[420px] sm:max-w-[480px] lg:h-[520px] lg:max-w-[560px]"
		>
			<figure
				class="absolute top-3 left-[3%] w-[56%] -rotate-8 rounded-xl border border-border bg-card p-2 pb-8 text-card-foreground shadow-2xl sm:p-3 sm:pb-12 lg:w-[59%] lg:pb-14"
			>
				<img
					src="/editorial/dinner-table-v2.png"
					alt="Two people sharing dinner by candlelight"
					width="1254"
					height="1254"
					class="aspect-square w-full rounded-md object-cover"
				/>
			</figure>
			<figure
				class="absolute top-12 right-[2%] w-[56%] rotate-7 rounded-xl border border-border bg-card p-2 pb-8 text-card-foreground shadow-2xl sm:top-20 sm:p-3 sm:pb-12 lg:top-28 lg:w-[59%] lg:pb-14"
			>
				<img
					src="/editorial/restaurant-arrival-v2.png"
					alt="Two friends approaching a restaurant"
					width="1254"
					height="1254"
					class="aspect-square w-full rounded-md object-cover"
				/>
			</figure>
		</div>
	</aside>
</main>

<style>
	.credential-heading {
		margin: 0.15rem 0 0.4rem;
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: -0.04em;
		line-height: 1.1;
	}

	.credential-fields,
	.identity-details {
		display: grid;
		gap: 0.3rem;
	}

	.record-number {
		color: #a64b29;
		font-size: 0.5rem;
		font-weight: 700;
		letter-spacing: 0.12em;
	}

	.identity-value {
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0.03em;
	}

	.identity-facts {
		display: flex;
		gap: 0.6rem;
	}

	.identity-facts p {
		display: grid;
		gap: 0.1rem;
	}

	.identity-facts span {
		color: #9f4a2c;
		font-size: 0.43rem;
		font-weight: 700;
		letter-spacing: 0.08em;
	}

	.identity-facts strong {
		font-size: 0.58rem;
	}

	.passport-field label {
		display: block;
		color: #9f4a2c;
		font-size: 0.52rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.passport-input {
		display: block;
		width: 100%;
		min-height: 2rem;
		padding: 0.25rem 0;
		border: 0;
		border-bottom: 1px solid #aaa397;
		border-radius: 0;
		background: transparent;
		color: #191817;
		font-size: 0.82rem;
		box-shadow: none;
	}

	.passport-input::placeholder {
		color: #918b80;
	}

	.passport-input:focus {
		border-bottom: 2px solid #a64b29;
		outline: 0;
		box-shadow: none;
	}

	.form-error {
		color: #9d3620;
		font-size: 0.7rem;
	}

	.submit-action {
		display: inline-flex;
		min-height: 2.75rem;
		min-width: 2.75rem;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: transparent;
		cursor: pointer;
	}

	.submit-action span {
		color: #a64b29;
		font-size: 1.6rem;
		line-height: 1;
	}

	.social-action span {
		color: #a64b29;
		font-size: 1.1rem;
		line-height: 1;
	}

	.passport-options {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		margin-top: 0.1rem;
	}

	.switch-mode {
		color: #615b52;
		font-size: 0.72rem;
	}

	.switch-mode button {
		min-height: 2.75rem;
		margin-left: 0.2rem;
		color: #a64b29;
		font-weight: 700;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}

	.social-action {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.4rem;
		color: #191817;
		font-size: 0.72rem;
		font-weight: 700;
		cursor: pointer;
	}

	.submit-action:focus-visible,
	.social-action:focus-visible,
	.switch-mode button:focus-visible {
		outline: 2px solid #a64b29;
		outline-offset: 3px;
	}

	.art-surface {
		position: relative;
		isolation: isolate;
	}

	.art-surface::before {
		content: '';
		position: absolute;
		inset: 0;
		background:
			radial-gradient(ellipse 65% 65% at 48% 45%, rgb(255 255 255 / 9%), transparent 75%),
			url('/editorial/paper-grain.svg');
		background-blend-mode: screen;
		mask-image: radial-gradient(ellipse 50% 48% at 50% 50%, black 15%, transparent 100%);
		pointer-events: none;
	}

	:global(html:has(.login-page) .layout-debug-toggle),
	:global(html:has(.login-page) #svelte-inspector-toggle) {
		display: none !important;
	}
</style>
