# Random Oracle Kubernetes Deployment

This directory contains the Kubernetes configurations for deploying the Random Oracle service.

## Deployment Instructions

1. **Create ConfigMap and Secrets**:

   ```sh
   kubectl apply -f k8s/configmap.yaml
   kubectl apply -f k8s/secret.yaml
   ```

2. **Deploy the Application**:

   ```sh
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   ```

3. **Optional: Set Up Ingress**:

   ```sh
   kubectl apply -f k8s/ingress.yaml
   ```

4. **Check the Deployment**:

   ```sh
   kubectl get pods
   kubectl get services
   kubectl get ingress
   ```

5. **View Logs**:
   ```sh
   kubectl logs -f deployment/random-oracle-deployment
   ```

## Notes

- Adjust resource limits in the `deployment.yaml` based on your cluster's capacity and application needs.
- Ingress setup depends on the Ingress controller in your cluster. The example assumes you're using NGINX Ingress Controller.
