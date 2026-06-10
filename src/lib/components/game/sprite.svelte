<script lang="ts">
    interface Props {
        spriteName: string;
        animation: 'idle' | 'attack' | 'hit' | 'death';
        flipped?: boolean;
        onAnimEnd?: () => void;
    }

    let { spriteName, animation, flipped = false, onAnimEnd }: Props = $props();

    let currentAnim = $state(animation);

    $effect(() => {
        currentAnim = animation;
    });

    function handleAnimEnd() {
        if (currentAnim !== 'idle' && currentAnim !== 'death') {
            currentAnim = 'idle';
        }
        onAnimEnd?.();
    }

    let spriteUrl = $derived(`/sprites/${spriteName}.png`);
    let cssClass = $derived(`sprite anim-${currentAnim}`);
</script>

<div
  class="sprite anim-{currentAnim}"
  style="
    background-image: url({spriteUrl});
    transform: scaleX({flipped ? -1 : 1});
  "
  onanimationend={handleAnimEnd}
  role="img"
  aria-label={spriteName}
></div>