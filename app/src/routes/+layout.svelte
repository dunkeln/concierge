<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import './layout.css';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

{#if page.url.pathname === '/login'}
	{@render children()}
{:else}
	<div class="min-h-dvh bg-primary text-primary-foreground">
		<div class="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 sm:px-8">
			<header class="flex items-center justify-between border-b border-primary-foreground/15 py-5">
				<a href={resolve('/')} class="text-lg tracking-wide">concierge</a>
				{#if data.user}
					<details class="relative">
						<summary class="cursor-pointer text-sm">{data.user.name}</summary>
						<div
							class="absolute top-full right-0 z-10 mt-3 min-w-48 rounded-lg border border-primary-foreground/20 bg-primary p-4 shadow-xl"
						>
							<p class="mb-3 text-xs text-primary-foreground/60">{data.user.email}</p>
							<form method="post" action="/?/signOut">
								<button class="text-sm underline underline-offset-4">Sign out</button>
							</form>
						</div>
					</details>
				{/if}
			</header>
			{@render children()}
		</div>
	</div>
{/if}
