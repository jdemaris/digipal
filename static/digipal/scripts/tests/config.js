var config = {
    root: "http://localhost:80",
    tests: ['collection', 'annotator'],
    deepScan: false,
    scenarios: {
        path: "scenarios",
        excludes: []
    }
};

exports.config = config;