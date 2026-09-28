<script lang="ts">
	import { Popover } from 'bits-ui';
	import PassportStamp from './PassportStamp.svelte';
	import PreferencesForm from './PreferencesForm.svelte';
	import { scenarios } from './onboarding';

	let {
		visits,
		profile,
		error
	}: {
		visits: { id: string; place: string; visitedOn: string; scene: string }[];
		profile: { atmospheres: string[]; cuisines: string[]; travelMinutes: number } | null;
		error?: string;
	} = $props();
	const today = new Date().toISOString().slice(0, 10);
	let place = $state('');
	let scene = $state<string>(scenarios[0].atmosphere);
	const palette: Record<string, string> = {
		Quiet: '#8caedc',
		Lively: '#ffb278',
		Intimate: '#b391ce',
		Casual: '#accca0',
		Adventurous: '#ed9e58',
		Brunch: '#f3d58b',
		Coffee: '#d5b998'
	};
</script>

<section class="mx-auto w-full max-w-4xl" aria-labelledby="passport-title">
	<header class="flex items-start justify-between gap-4 pb-5">
		<div>
			<h1 id="passport-title" class="text-3xl font-medium tracking-tight">Your passport</h1>
		</div>
		<a
			href="/"
			class="flex min-h-11 shrink-0 items-center rounded-xl px-3 text-sm text-primary-foreground/65 hover:bg-secondary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
			>Back to chat</a
		>
	</header>
	<div class="grid items-start gap-10 pt-6 md:grid-cols-[20rem_minmax(0,1fr)] md:gap-12">
		<section aria-labelledby="preferences-title" class="min-w-0">
			<h2 id="preferences-title" class="text-base font-medium">Your preferences</h2>
			<PreferencesForm {profile} action="/onboarding?edit=1&passport=1" passport={true} />
		</section>
		<section aria-labelledby="visits-title" class="min-w-0">
			<div class="flex items-baseline gap-3">
				<h2 id="visits-title" class="text-base font-medium">Your memories</h2>
			</div>
			<form method="post" action="/?/addVisit" class="mt-8 grid min-w-0 gap-5">
				<div class="flex min-w-0 items-center gap-4">
					<div
						class="shrink-0"
						style={`color: ${palette[scene]}; filter: drop-shadow(0 0 16px ${palette[scene]}55)`}
					>
						<PassportStamp id={place} {scene} />
					</div>
					<div class="grid min-w-0 flex-1 gap-2">
						<label for="memory-place" class="sr-only">Where did you go?</label>
						<input
							id="memory-place"
							name="place"
							bind:value={place}
							required
							maxlength="120"
							autocomplete="off"
							placeholder="Where did you go?"
							class="min-h-11 w-full min-w-0 rounded-lg border-0 bg-transparent px-0 py-2 text-xl font-medium tracking-tight text-primary-foreground placeholder:text-primary-foreground/40 focus:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2"
						/>
						<label
							class="grid min-w-0 justify-items-start gap-1 text-xs text-primary-foreground/60"
						>
							When did you go?
							<input
								type="date"
								name="visitedOn"
								required
								max={today}
								value={today}
								class="min-h-11 max-w-full min-w-0 rounded-lg border-0 bg-transparent px-0 text-sm text-primary-foreground focus:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2"
							/>
						</label>
					</div>
				</div>
				<fieldset class="min-w-0">
					<legend class="sr-only">What kind of outing?</legend>
					<div class="flex flex-wrap gap-x-1 gap-y-1">
						{#each scenarios as scenario (scenario.atmosphere)}
							<label
								class="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm text-primary-foreground/65 has-checked:bg-secondary has-checked:text-primary-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
							>
								<input
									type="radio"
									name="scene"
									value={scenario.atmosphere}
									bind:group={scene}
									required
									class="sr-only"
								/>
								<span
									class="size-2.5 shrink-0 rounded-full"
									style={`background: ${palette[scenario.atmosphere]}`}
									aria-hidden="true"
								></span>
								{scenario.atmosphere}
							</label>
						{/each}
					</div>
				</fieldset>
				{#if error}<p role="alert" class="text-xs text-destructive">{error}</p>{/if}
				<button
					type="submit"
					class="min-h-11 justify-self-start rounded-xl bg-primary-foreground px-4 py-2 text-sm font-medium text-primary transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96] motion-reduce:transition-none"
					>Save memory</button
				>
			</form>
			<div class="mt-6">
				<Popover.Root>
					<Popover.Trigger
						aria-label={`View ${visits.length} saved memories`}
						title="Saved memories"
						disabled={!visits.length}
						class="inline-flex size-11 items-center justify-center rounded-full bg-secondary text-sm font-medium tabular-nums transition-transform hover:bg-secondary/80 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96] disabled:opacity-40 motion-reduce:transition-none"
					>{visits.length}</Popover.Trigger>
					<Popover.Portal>
						<Popover.Content
							aria-label="Saved memories"
							side="top"
							align="start"
							sideOffset={8}
							class="z-50 max-h-[min(24rem,var(--bits-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-2xl bg-secondary p-4 text-primary-foreground shadow-xl"
						>
							<ol class="space-y-3">
								{#each visits as visit (visit.id)}
									<li class="flex items-center gap-4 py-5">
										<div class="min-w-0 flex-1">
											<p class="text-xs text-primary-foreground/50">{visit.scene}</p>
											<h3 class="mt-1 text-base font-medium break-words">{visit.place}</h3>
											<p class="mt-1 text-xs text-primary-foreground/50">
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
												class="mt-1"
												onsubmit={(event) => {
													if (!confirm('Remove this memory from your passport?')) event.preventDefault();
												}}
											>
												<input type="hidden" name="id" value={visit.id} />
												<button
													class="min-h-11 text-xs text-primary-foreground/45 underline-offset-4 hover:text-primary-foreground/80 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
													>Remove memory</button
												>
											</form>
										</div>
										<div class="shrink-0 text-[#c9aa86]">
											<PassportStamp id={visit.id} scene={visit.scene} />
										</div>
									</li>
								{/each}
							</ol>
						</Popover.Content>
					</Popover.Portal>
				</Popover.Root>
			</div>
		</section>
	</div>
</section>
