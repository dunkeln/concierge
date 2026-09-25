<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Concierge — Your next table</title>
	<meta name="description" content="A simple place to plan your next restaurant reservation." />
</svelte:head>

<main class="flex flex-1 flex-col justify-center py-12 sm:py-20">
	<div class="mx-auto w-full max-w-3xl">
		<p class="mb-6 text-xs tracking-[0.3em] text-primary-foreground/55 uppercase">
			Welcome, {data.user?.name}
		</p>
		<h1 class="max-w-2xl text-[clamp(2.8rem,8vw,5.5rem)] leading-[0.98] tracking-tight">
			A table worth going out for.
		</h1>
		<p class="mt-6 max-w-xl text-base leading-relaxed text-primary-foreground/65">
			Tell us when and where you want to eat. The reservation chat will appear here once its booking
			platform is connected.
		</p>
		<div
			class="mt-12 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/5 p-4 sm:p-5"
		>
			<label
				for="reservation-request"
				class="mb-3 block text-xs tracking-[0.2em] text-primary-foreground/55 uppercase"
				>Your reservation request</label
			>
			<textarea
				id="reservation-request"
				rows="3"
				disabled
				placeholder="A table for two in the West Village on Friday, 7–9 pm"
				class="w-full resize-none border-0 bg-transparent p-0 text-base placeholder:text-primary-foreground/35 focus:ring-0 disabled:cursor-not-allowed"
			></textarea>
			<p class="mt-4 border-t border-primary-foreground/15 pt-4 text-sm text-primary-foreground/55">
				Booking platform connection pending
			</p>
		</div>
	</div>
</main>
