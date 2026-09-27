<script lang="ts">
	import PassportStamp from './PassportStamp.svelte';
	import { scenarios } from './onboarding';

	let {
		visits,
		atmospheres,
		error
	}: {
		visits: { id: string; place: string; visitedOn: string; scene: string }[];
		atmospheres: string[];
		error?: string;
	} = $props();
	const today = new Date().toISOString().slice(0, 10);
</script>

<section class="mx-auto w-full max-w-xl space-y-5" aria-labelledby="passport-title">
	<div class="flex items-center justify-between gap-4">
		<div>
			<p class="text-xs tracking-[0.22em] text-primary-foreground/50 uppercase">Concierge</p>
			<h1 id="passport-title" class="mt-1 text-2xl font-medium">Your passport</h1>
		</div>
		<a href="/" class="text-sm text-primary-foreground/65 underline-offset-4 hover:underline"
			>Back to chat</a
		>
	</div>
	{#if atmospheres.length}
		<p class="text-xs text-primary-foreground/55">Starting tastes · {atmospheres.join(' · ')}</p>
	{/if}

	<div
		class="rounded-4xl border border-[#cdbfae] bg-[#eee8dd] p-5 text-[#302921] shadow-[0_18px_50px_rgb(0_0_0/0.18)] sm:p-7"
	>
		<div class="flex items-end justify-between border-b border-[#b9aa96] pb-4">
			<div>
				<p class="text-[0.65rem] font-semibold tracking-[0.2em] uppercase">Places remembered</p>
				<p class="mt-1 text-sm text-[#736657]">A personal record of where you’ve been.</p>
			</div>
			<span class="font-serif text-3xl tabular-nums">{visits.length}</span>
		</div>
		{#if visits.length}
			<ol class="divide-y divide-[#c8bba9]">
				{#each visits as visit (visit.id)}
					<li class="flex items-center gap-4 py-5">
						<div class="min-w-0 flex-1">
							<p class="text-[0.65rem] tracking-[0.17em] text-[#806950] uppercase">{visit.scene}</p>
							<h2 class="mt-1 truncate text-lg font-medium">{visit.place}</h2>
							<p class="mt-1 text-xs text-[#736657]">
								{new Date(`${visit.visitedOn}T00:00:00Z`).toLocaleDateString('en-US', {
									timeZone: 'UTC',
									month: 'long',
									day: 'numeric',
									year: 'numeric'
								})}
							</p>
							<form
								method="post"
								action="/?/removeVisit"
								class="mt-3"
								onsubmit={(event) => {
									if (!confirm('Remove this visit from your passport?')) event.preventDefault();
								}}
							>
								<input type="hidden" name="id" value={visit.id} />
								<button class="text-xs text-[#736657] underline-offset-2 hover:underline"
									>Remove entry</button
								>
							</form>
						</div>
						<div class="text-[#9b6d4b]"><PassportStamp id={visit.id} scene={visit.scene} /></div>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="py-10 text-center text-sm text-[#736657]">Your first visit will appear here.</p>
		{/if}
	</div>

	<details class="rounded-3xl border border-primary-foreground/20 bg-secondary p-4">
		<summary class="cursor-pointer text-sm font-medium">Record a visit</summary>
		<form method="post" action="/?/addVisit" class="mt-5 grid gap-4">
			<label class="grid gap-1 text-xs text-primary-foreground/70"
				>Place
				<input
					name="place"
					required
					maxlength="120"
					autocomplete="off"
					placeholder="Where did you go?"
					class="rounded-xl border border-primary-foreground/25 bg-primary px-3 py-2 text-sm text-primary-foreground"
				/>
			</label>
			<div class="grid grid-cols-2 gap-3">
				<label class="grid gap-1 text-xs text-primary-foreground/70"
					>Date
					<input
						type="date"
						name="visitedOn"
						required
						max={today}
						class="min-w-0 rounded-xl border border-primary-foreground/25 bg-primary px-3 py-2 text-sm text-primary-foreground"
					/>
				</label>
				<label class="grid gap-1 text-xs text-primary-foreground/70"
					>What kind of outing?
					<select
						name="scene"
						required
						class="min-w-0 rounded-xl border border-primary-foreground/25 bg-primary px-3 py-2 text-sm text-primary-foreground"
					>
						{#each scenarios as scene}<option value={scene.atmosphere}>{scene.atmosphere}</option
							>{/each}
					</select>
				</label>
			</div>
			<p class="text-xs text-primary-foreground/50">
				You add these visits yourself. They are separate from reservation confirmations.
			</p>
			{#if error}<p role="alert" class="text-xs text-destructive">{error}</p>{/if}
			<button
				type="submit"
				class="justify-self-start rounded-xl bg-primary-foreground px-4 py-2 text-sm font-medium text-primary"
				>Add to passport</button
			>
		</form>
	</details>
</section>
