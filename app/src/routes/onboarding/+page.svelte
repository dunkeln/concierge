<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import { scenarios, travelMinutes } from '$lib/onboarding';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Your taste — Concierge</title></svelte:head>

<main class="flex flex-1 items-center py-12 sm:py-16">
	<div class="w-full max-w-3xl">
		<div class="flex items-center gap-3">
			<Avatar.Root class="size-12 ring-1 ring-primary-foreground/20" aria-hidden="true">
				{#if data.user?.image}<Avatar.Image src={data.user.image} alt="" />{/if}
				<Avatar.Fallback class="bg-primary-foreground text-base font-medium text-primary">
					{data.user?.name?.trim().charAt(0).toUpperCase() || 'G'}
				</Avatar.Fallback>
			</Avatar.Root>
			<div>
				<p class="text-xs tracking-[0.3em] text-primary-foreground/55 uppercase">Your first page</p>
			</div>
		</div>
		<h1 class="mt-5 max-w-2xl text-[clamp(2.5rem,7vw,5rem)] leading-[1.02] tracking-tight">
			What feels like a good night out?
		</h1>
		<p class="mt-5 max-w-xl text-base leading-relaxed text-primary-foreground/65">
			Which plans sound like you? Pick one or two. We’ll use them as a starting point, and you can
			always ask for something different.
		</p>

		<form method="POST" class="mt-10 space-y-9">
			<fieldset>
				<legend class="mb-3 text-sm font-medium"
					>Picture a good night <span class="text-primary-foreground/55">· choose up to 2</span
					></legend
				>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each scenarios as scenario (scenario.atmosphere)}
						<label class="block">
							<input
								class="peer sr-only"
								type="checkbox"
								name="atmosphere"
								value={scenario.atmosphere}
							/>
							<span
								class="flex min-h-28 cursor-pointer flex-col justify-center rounded-2xl border border-primary-foreground/25 px-5 py-4 transition-colors peer-checked:border-primary-foreground peer-checked:bg-primary-foreground/12 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-foreground hover:border-primary-foreground/60"
							>
								<span class="font-medium">{scenario.title}</span>
								<span class="mt-1 text-sm text-primary-foreground/60">{scenario.detail}</span>
							</span>
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
								class="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-primary-foreground/30 px-4 text-sm transition-colors peer-checked:bg-primary-foreground peer-checked:text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-foreground hover:border-primary-foreground/70"
								>{minutes} min</span
							>
						</label>
					{/each}
				</div>
			</fieldset>

			{#if form?.message}<p role="alert" class="text-sm text-red-400">{form.message}</p>{/if}
			<button
				class="min-h-12 rounded-lg bg-primary-foreground px-6 font-medium text-primary transition-transform active:scale-95"
				>Continue <span aria-hidden="true">→</span></button
			>
		</form>
	</div>
</main>
