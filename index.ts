import * as k8s from "@pulumi/kubernetes";

// Create a namespace for the weather app
const namespace = new k8s.core.v1.Namespace("kube-weather", {
    metadata: { name: "kube-weather" }
});

// Create a ConfigMap for the HTML content
const configMap = new k8s.core.v1.ConfigMap("kube-weather-config", {
    metadata: {
        namespace: namespace.metadata.name
    },
    data: {
        "index.html": require("fs").readFileSync("www/index.html", "utf8")
    }
});

// Create the deployment
const appLabels = { app: "kube-weather" };
const deployment = new k8s.apps.v1.Deployment("kube-weather", {
    metadata: {
        namespace: namespace.metadata.name
    },
    spec: {
        selector: { matchLabels: appLabels },
        replicas: 2,
        template: {
            metadata: { labels: appLabels },
            spec: {
                containers: [{
                    name: "nginx",
                    image: "nginx:alpine",
                    ports: [{ containerPort: 80 }],
                    volumeMounts: [{
                        name: "html-content",
                        mountPath: "/usr/share/nginx/html"
                    }]
                }],
                volumes: [{
                    name: "html-content",
                    configMap: {
                        name: configMap.metadata.name
                    }
                }]
            }
        }
    }
});

// Create a service to expose the deployment
const service = new k8s.core.v1.Service("kube-weather", {
    metadata: {
        namespace: namespace.metadata.name
    },
    spec: {
        type: "NodePort",
        ports: [{ port: 80, targetPort: 80 }],
        selector: appLabels
    }
});

// Export the NodePort
export const nodePort = service.spec.ports[0].nodePort;