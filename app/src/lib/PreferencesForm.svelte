<script lang="ts">
	import { enhance, applyAction } from '$app/forms';
	import { untrack } from 'svelte';
	import { Popover } from 'bits-ui';
	import SFIcon from '@alexdev404/sficons-svelte';
	import { cuisines, scenarios, travelMinutes } from '$lib/onboarding';

	let {
		profile,
		action = undefined,
		passport = false,
		message
	}: {
		profile: { atmospheres: string[]; cuisines: string[]; travelMinutes: number } | null;
		action?: string;
		passport?: boolean;
		message?: string;
	} = $props();
	let localMessage = $state<string | undefined>();

	let selectedCuisines = $state<string[]>(untrack(() => profile?.cuisines.slice() ?? []));
	let selectedAtmospheres = $state<string[]>(untrack(() => profile?.atmospheres.slice() ?? []));
	let cuisineQuery = $state('');
	let pickerOpen = $state(false);
	const palettes: Record<string, [string, string, string]> = {
		Quiet: ['#8caedc', '#8ec6bd', '#374c84'],
		Lively: ['#ffb278', '#e56d8b', '#872c56'],
		Intimate: ['#b391ce', '#d5849d', '#533a75'],
		Casual: ['#accca0', '#e4ca89', '#4a8069'],
		Adventurous: ['#ed9e58', '#af84dc', '#524cb0'],
		Brunch: ['#f3d58b', '#efac99', '#b67b6d'],
		Coffee: ['#d5b998', '#ac8d78', '#5e4947']
	};
	let filteredCuisines = $derived(
		cuisines.filter(
			(cuisine) =>
				!selectedCuisines.some(
					(selected) => selected.toLocaleLowerCase() === cuisine.toLocaleLowerCase()
				) && cuisine.toLocaleLowerCase().includes(cuisineQuery.trim().toLocaleLowerCase())
		)
	);
	let customCuisine = $derived(cuisineQuery.trim().replace(/\s+/g, ' '));
	let canAddCustom = $derived(
		customCuisine.length > 0 &&
			customCuisine.length <= 60 &&
			![...cuisines, ...selectedCuisines].some(
				(cuisine) => cuisine.toLocaleLowerCase() === customCuisine.toLocaleLowerCase()
			)
	);

	$effect(() => {
		selectedCuisines = profile?.cuisines.slice() ?? [];
		selectedAtmospheres = profile?.atmospheres.slice() ?? [];
	});

	function addCuisine(cuisine: string) {
		if (selectedCuisines.length >= 3) return;
		selectedCuisines = [...selectedCuisines, cuisine];
		cuisineQuery = '';
		pickerOpen = false;
	}

	function enhancePreferences(form: HTMLFormElement) {
		if (!passport) return;
		return enhance<Record<string, never>, { message: string }>(form, () => {
			localMessage = undefined;
			return async ({ result }) => {
				if (result.type === 'failure') {
					localMessage = result.data?.message;
				} else {
					await applyAction(result);
				}
			};
		});
	}
</script>

<form
	method="POST"
	{action}
	use:enhancePreferences
	class={passport ? 'passport-preferences mt-4 space-y-4' : 'mt-10 space-y-9'}
>
	<fieldset>
		<legend class="mb-3 text-sm font-medium"
			>{passport ? 'Atmosphere' : 'Picture a good outing'}
			<span class="text-primary-foreground/55">· choose up to 2</span></legend
		>
		<div class="atmosphere-carousel" aria-label="Atmosphere choices">
			{#each scenarios as scenario (scenario.atmosphere)}
				<label
					class="atmosphere-choice"
					style={`--tone-a:${palettes[scenario.atmosphere][0]};--tone-b:${palettes[scenario.atmosphere][1]};--tone-c:${palettes[scenario.atmosphere][2]}`}
				>
					<input
						class="sr-only"
						type="checkbox"
						name="atmosphere"
						value={scenario.atmosphere}
						bind:group={selectedAtmospheres}
						disabled={selectedAtmospheres.length >= 2 &&
							!selectedAtmospheres.includes(scenario.atmosphere)}
					/>
					<span class="atmosphere-art">
						<span class="selection-check" aria-hidden="true"
							><SFIcon icon="checkmark" size="xs" /></span
						>
						<span class="atmosphere-name">{scenario.atmosphere}</span>
					</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<fieldset>
		<legend class="mb-3 text-sm font-medium">
			{passport ? 'Cuisines' : 'Favorite cuisines'}
			<span class="text-primary-foreground/55"
				>· {passport ? 'up to 3, optional' : 'optional, choose up to 3'}</span
			>
		</legend>
		<div class="flex flex-wrap items-center gap-2">
			{#each selectedCuisines as cuisine (cuisine)}
				<input type="hidden" name="cuisine" value={cuisine} />
				<button
					type="button"
					class="cuisine-chip"
					aria-label={`Remove ${cuisine}`}
					onclick={() => (selectedCuisines = selectedCuisines.filter((item) => item !== cuisine))}
				>
					<span class="min-w-0 truncate">{cuisine}</span><SFIcon icon="xmark" size="xs" />
				</button>
			{/each}
			<Popover.Root bind:open={pickerOpen}>
				<Popover.Trigger
					class="cuisine-add"
					aria-label="Add cuisine"
					disabled={selectedCuisines.length >= 3}
				>
					<SFIcon icon="plus" size="sm" />
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content
						sideOffset={8}
						align="start"
						class="z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-[#1c1c1e] p-3 text-primary-foreground shadow-[0_0_0_1px_rgb(255_255_255/0.12),0_16px_48px_rgb(0_0_0/0.4)]"
					>
						<input
							aria-label="Search cuisines"
							placeholder="Search or add a cuisine"
							maxlength="60"
							bind:value={cuisineQuery}
							class="mb-2 min-h-11 w-full rounded-lg bg-white/8 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-white/40"
							onkeydown={(event) => {
								if (event.key === 'Enter' && !event.isComposing) {
									event.preventDefault();
									if (filteredCuisines.length === 1) addCuisine(filteredCuisines[0]);
									else if (canAddCustom) addCuisine(customCuisine);
								}
							}}
						/>
						<div class="max-h-64 overflow-y-auto" aria-label="Available cuisines">
							{#each filteredCuisines as cuisine}
								<button
									type="button"
									class="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-white/8 focus-visible:outline-2"
									onclick={() => addCuisine(cuisine)}>{cuisine}</button
								>
							{/each}
							{#if canAddCustom}
								<button
									type="button"
									class="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-white/8 focus-visible:outline-2"
									onclick={() => addCuisine(customCuisine)}
									><SFIcon icon="plus" size="xs" />Add “{customCuisine}”</button
								>
							{/if}
						</div>
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		</div>
	</fieldset>

	<fieldset>
		<legend class="mb-3 text-sm font-medium">Willing to travel</legend>
		<div class={passport ? 'preference-group travel-group' : 'flex flex-wrap gap-2'}>
			{#each travelMinutes as minutes (minutes)}
				<label class={passport ? 'preference-row' : undefined}>
					<input
						class={passport ? 'preference-control' : 'peer sr-only'}
						type="radio"
						name="travelMinutes"
						value={minutes}
						checked={minutes === (profile?.travelMinutes ?? 30)}
					/>
					<span
						class={passport
							? 'text-sm whitespace-nowrap'
							: 'inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-primary-foreground/30 px-4 text-sm transition-colors peer-checked:bg-primary-foreground peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-foreground hover:border-primary-foreground/70'}
						>{minutes} min</span
					>
				</label>
			{/each}
		</div>
	</fieldset>

	{#if localMessage ?? message}<p role="alert" class="text-sm text-red-400">
			{localMessage ?? message}
		</p>{/if}
	<button
		class={passport
			? 'min-h-11 w-full rounded-xl bg-primary-foreground px-5 text-sm font-medium text-primary transition-transform active:scale-[0.96] motion-reduce:transition-none'
			: 'min-h-12 rounded-lg bg-primary-foreground px-6 font-medium text-primary transition-transform active:scale-95'}
		>{passport || profile ? 'Save preferences' : 'Continue'}
		{#if !passport}<span aria-hidden="true">→</span>{/if}</button
	>
</form>

<style>
	fieldset {
		min-width: 0;
	}
	.atmosphere-carousel {
		display: flex;
		gap: 0.75rem;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		scrollbar-width: thin;
		scrollbar-color: #ffffff30 transparent;
		padding: 0.25rem 0.25rem 0.75rem;
	}
	.atmosphere-choice {
		position: relative;
		flex: 0 0 7.5rem;
		scroll-snap-align: start;
		cursor: pointer;
	}
	.atmosphere-art {
		position: relative;
		display: flex;
		align-items: end;
		height: 9rem;
		padding: 0.875rem;
		border-radius: 1rem;
		overflow: hidden;
		background:
			radial-gradient(ellipse at 10% 15%, var(--tone-a), transparent 65%),
			radial-gradient(ellipse at 90% 40%, var(--tone-b), transparent 65%),
			radial-gradient(ellipse at 30% 90%, var(--tone-c), transparent 75%), var(--tone-b);
		box-shadow: inset 0 0 0 1px #ffffff20;
		transition:
			transform 150ms,
			box-shadow 150ms;
	}
	.atmosphere-art::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(transparent 35%, #00000075);
	}
	.atmosphere-name {
		position: relative;
		color: white;
		font-weight: 500;
		font-size: 0.9375rem;
	}
	.selection-check {
		position: absolute;
		right: 0.625rem;
		top: 0.625rem;
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		background: white;
		color: #171717;
		opacity: 0;
	}
	.atmosphere-choice:has(input:checked) .atmosphere-art {
		box-shadow:
			inset 0 0 0 2px white,
			0 0 0 2px #ffffff25;
	}
	.atmosphere-choice:has(input:checked) .selection-check {
		opacity: 1;
	}
	.atmosphere-choice:has(input:focus-visible) .atmosphere-art {
		outline: 2px solid white;
		outline-offset: 3px;
	}
	.atmosphere-choice:has(input:disabled) {
		cursor: default;
	}
	.atmosphere-choice:not(:has(input:disabled)):active .atmosphere-art {
		transform: scale(0.96);
	}
	.cuisine-chip,
	:global(.cuisine-add) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		min-height: 2.75rem;
		border-radius: 0.875rem;
		background: var(--secondary);
		padding: 0.5rem 0.875rem;
		font-size: 0.875rem;
		max-width: 100%;
	}
	:global(.cuisine-add) {
		width: 2.75rem;
		padding: 0;
		border: 1px dashed #ffffff40;
		background: transparent;
	}
	.cuisine-chip:hover,
	:global(.cuisine-add:hover) {
		background: #ffffff15;
	}
	.cuisine-chip:focus-visible,
	:global(.cuisine-add:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}
	:global(.cuisine-add:disabled) {
		opacity: 0.35;
	}
	@media (prefers-reduced-motion: reduce) {
		.atmosphere-art {
			transition: none;
		}
	}

	.preference-group {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.preference-row {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.375rem;
		padding: 0.5rem;
		border-radius: 0.625rem;
		background: transparent;
		cursor: pointer;
	}

	.preference-row:hover {
		background: var(--secondary);
	}

	.preference-row:has(input:checked) {
		background: color-mix(in srgb, var(--primary-foreground) 12%, transparent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-foreground) 30%, transparent);
	}

	.preference-row:has(input:focus-visible) {
		outline: 2px solid var(--ring);
		outline-offset: 2px;
	}

	.preference-control {
		order: 1;
		width: 0.875rem;
		height: 0.875rem;
		flex-shrink: 0;
		appearance: auto;
		accent-color: var(--primary-foreground);
	}

	.travel-group {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: 0.875rem;
		background: var(--secondary);
	}

	.travel-group .preference-row {
		justify-content: center;
		gap: 0.375rem;
		padding-inline: 0.25rem;
		background: transparent;
	}

	.travel-group .preference-row:has(input:checked) {
		background: var(--primary-foreground);
		color: var(--primary);
		box-shadow: none;
	}

	.travel-group .preference-control {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
</style>
