<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import { atmospheres, budgets, cuisines, travelMinutes } from '$lib/onboarding';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Your taste — Concierge</title></svelte:head>

<main class="flex flex-1 items-center py-12 sm:py-16">
	<div class="w-full max-w-3xl">
		<div class="flex items-center gap-3">
			<Avatar.Root class="size-12 ring-1 ring-primary-foreground/20">
				{#if data.user?.image}<Avatar.Image src={data.user.image} alt="" />{/if}
				<Avatar.Fallback class="text-base font-medium text-foreground">
					{data.user?.name?.trim().charAt(0).toUpperCase() || 'G'}
				</Avatar.Fallback>
			</Avatar.Root>
			<div>
				<p class="text-xs tracking-[0.3em] text-primary-foreground/55 uppercase">Your first page</p>
				<p class="mt-1 text-sm text-primary-foreground/80">{data.user?.name}</p>
			</div>
		</div>
		<h1 class="mt-5 max-w-2xl text-[clamp(2.5rem,7vw,5rem)] leading-[1.02] tracking-tight">
			What feels like a good night out?
		</h1>
		<p class="mt-5 max-w-xl text-base leading-relaxed text-primary-foreground/65">
			Pick a few starting points for future restaurant suggestions. You can still ask for any table
			when booking is connected.
		</p>

		<form method="POST" class="mt-10 space-y-9">
			<fieldset>
				<legend class="mb-3 text-sm font-medium"
					>Cuisines <span class="text-primary-foreground/55">· choose up to 3</span></legend
				>
				<div class="flex flex-wrap gap-2">
					{#each cuisines as cuisine (cuisine)}
						<label>
							<input class="peer sr-only" type="checkbox" name="cuisine" value={cuisine} />
							<span
								class="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-primary-foreground/30 px-4 text-sm transition-colors peer-checked:bg-primary-foreground peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-foreground hover:border-primary-foreground/70"
								>{cuisine}</span
							>
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset>
				<legend class="mb-3 text-sm font-medium"
					>Atmosphere <span class="text-primary-foreground/55">· choose up to 2</span></legend
				>
				<div class="flex flex-wrap gap-2">
					{#each atmospheres as atmosphere (atmosphere)}
						<label>
							<input class="peer sr-only" type="checkbox" name="atmosphere" value={atmosphere} />
							<span
								class="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-primary-foreground/30 px-4 text-sm transition-colors peer-checked:bg-primary-foreground peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-foreground hover:border-primary-foreground/70"
								>{atmosphere}</span
							>
						</label>
					{/each}
				</div>
			</fieldset>

			<div class="grid gap-9 sm:grid-cols-2">
				<fieldset>
					<legend class="mb-3 text-sm font-medium">Usual budget</legend>
					<div class="flex flex-wrap gap-2">
						{#each budgets as budget (budget)}
							<label>
								<input
									class="peer sr-only"
									type="radio"
									name="budget"
									value={budget}
									checked={budget === 'Any'}
								/>
								<span
									class="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-primary-foreground/30 px-4 text-sm transition-colors peer-checked:bg-primary-foreground peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-foreground hover:border-primary-foreground/70"
									>{budget}</span
								>
							</label>
						{/each}
					</div>
				</fieldset>

				<fieldset>
					<legend class="mb-3 text-sm font-medium">Willing to travel</legend>
					<div class="flex flex-wrap gap-2">
						{#each travelMinutes as minutes (minutes)}
							<label>
								<input
									class="peer sr-only"
									type="radio"
									name="travelMinutes"
									value={minutes}
									checked={minutes === 30}
								/>
								<span
									class="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-primary-foreground/30 px-4 text-sm transition-colors peer-checked:bg-primary-foreground peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-foreground hover:border-primary-foreground/70"
									>{minutes} min</span
								>
							</label>
						{/each}
					</div>
				</fieldset>
			</div>

			{#if form?.message}<p role="alert" class="text-sm text-red-400">{form.message}</p>{/if}
			<button
				class="min-h-12 rounded-full bg-primary-foreground px-6 font-medium text-primary transition-transform active:scale-95"
				>Continue <span aria-hidden="true">→</span></button
			>
		</form>
	</div>
</main>
