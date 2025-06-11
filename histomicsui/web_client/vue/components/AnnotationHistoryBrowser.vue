<script>
export default {
    props: ['annotationData'],
    emits: ['revertToPreviousVersion'],
    data() {
        return {};
    },
    mounted() {
        console.log(this.annotationData);
    }
}
</script>

<template>
    <span>This is the annotation history browser</span>
</template>
