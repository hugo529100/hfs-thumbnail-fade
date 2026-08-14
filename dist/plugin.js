// plugin.js
exports.version = 1.0
exports.description = "Fade in effect for thumbnails"
exports.apiRequired = 8.65
exports.frontend_js = 'main.js'
exports.repo = "Hug3O/thumbnail-fade"

exports.config = {
    duration: {
        type: 'number',
        defaultValue: 600,
        min: 100,
        max: 2000,
        label: "Fade duration (ms)",
        helperText: "How long the fade animation lasts",
        xs: 6
    },
    delay: {
        type: 'number',
        defaultValue: 300,
        min: 0,
        max: 1000,
        label: "Random delay (ms)",
        helperText: "Maximum random delay before fade-in for cached images",
        xs: 6
    }
}

exports.init = async api => {
    return {
        middleware(ctx) {
            // 純前端插件
        }
    }
}