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

// Install the ngrok-operator CRD
// First, install the ngrok-operator CRD using kubectl (this should be done manually before applying the Pulumi code)
// kubectl apply -f https://github.com/ngrok/kubernetes-ingress-controller/releases/latest/download/crds.yaml
// kubectl apply -f https://github.com/ngrok/kubernetes-ingress-controller/releases/latest/download/manifests.yaml

// Create ngrok tunnel
const ngrokTunnel = new k8s.apiextensions.CustomResource("kube-weather-tunnel", {
    apiVersion: "ingress.k8s.ngrok.com/v1alpha1",
    kind: "NgrokTunnel",
    metadata: {
        namespace: namespace.metadata.name,
        name: "kube-weather-tunnel"
    },
    spec: {
        // Replace with your actual ngrok authtoken
        authtoken: {
            secret: {
                name: "ngrok-auth", // You need to create this secret with your ngrok authtoken
                key: "authtoken"
            }
        },
        // Configure the tunnel to forward to your service
        forwarders: [{
            name: "web",
            type: "http",
            backend: {
                service: {
                    name: service.metadata.name,
                    port: 80
                }
            }
        }]
    }
}, { provider });

// Create a Secret for the ngrok authtoken using Pulumi's config secrets
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

// Export the ngrok tunnel URL
// Note: To get the actual URL, you'll need to query the NgrokTunnel resource status after creation
export const ngrokTunnelName = ngrokTunnel.metadata.name;
export const serviceName = service.metadata.name;
export const namespaceName = namespace.metadata.name;

// Instructions for setting up and deploying:
// 1. Set the ngrok auth token as a secret in Pulumi config:
//    pulumi config set --secret ngrokAuthToken <your-ngrok-auth-token>
// 
// 2. Deploy the stack:
//    pulumi up
//
// 3. Get the URL after deployment:
//    kubectl get ngrok -n kube-weather kube-weather-tunnel -o jsonpath='{.status.url}'