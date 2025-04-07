import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// Load configuration for the stack
const config = new pulumi.Config();

// Configure the Kubernetes provider to use MicroK8s
const provider = new k8s.Provider("microk8s", {
    context: "microk8s", // Use the MicroK8s context
});

// Create a namespace for the weather app
const namespace = new k8s.core.v1.Namespace("kube-weather", {
    metadata: { name: "kube-weather" }
}, { provider });

// Create a ConfigMap for the HTML content
const configMap = new k8s.core.v1.ConfigMap("kube-weather-config", {
    metadata: {
        namespace: namespace.metadata.name
    },
    data: {
        "index.html": require("fs").readFileSync("www/index.html", "utf8")
    }
}, { provider });

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
}, { provider });

// Create a service for the deployment (ClusterIP instead of NodePort)
const service = new k8s.core.v1.Service("kube-weather", {
    metadata: {
        namespace: namespace.metadata.name
    },
    spec: {
        type: "ClusterIP", // Changed from NodePort to ClusterIP
        ports: [{ port: 80, targetPort: 80 }],
        selector: appLabels
    }
}, { provider });

const ngrokTunnel = new k8s.apiextensions.CustomResource("kube-weather-tunnel", {
    apiVersion: "ingress.k8s.ngrok.com/v1alpha1",
    kind: "Tunnel",
    metadata: {
        namespace: namespace.metadata.name,
        name: "kube-weather-tunnel"
    },
    spec: {
        forwardsTo: service.metadata.name
    }
}, { provider });

const ngrokAuthToken = config.requireSecret("ngrokAuthToken");
const ngrokAuthSecret = new k8s.core.v1.Secret("ngrok-auth", {
    metadata: {
        namespace: namespace.metadata.name,
        name: "ngrok-auth"
    },
    type: "Opaque",
    stringData: {
        authtoken: ngrokAuthToken
    }
}, { provider });


// Note: To get the actual URL, you'll need to query the NgrokTunnel resource status after creation
export const ngrokTunnelName = ngrokTunnel.metadata.name;
export const serviceName = service.metadata.name;
export const namespaceName = namespace.metadata.name;
