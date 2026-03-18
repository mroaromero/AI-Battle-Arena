<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<div class="h-screen w-full bg-background dark text-foreground">
  {@render children()}
</div>
