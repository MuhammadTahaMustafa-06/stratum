pipeline {
  agent any

  environment {
    PYTHON_VERSION      = '3.12'
    NODE_VERSION        = '20'
    ENVIRONMENT         = 'test'
    STRICT_AUTH_CHECKS  = 'false'
    SEED_DEMO_USERS              = 'false'
    SEED_SAMPLE_KNOWLEDGE_ARTICLES = 'false'
    METRICS_ENABLED     = 'false'
  }

  options {
    timestamps()
    disableConcurrentBuilds(abortPrevious: true)
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Postgres for tests') {
      steps {
        sh '''
          docker rm -f stratum-ci-pg 2>/dev/null || true
          docker run -d --name stratum-ci-pg -p 5433:5432 \
            -e POSTGRES_PASSWORD=postgres \
            -e POSTGRES_DB=jenkins_stratum \
            postgres:15-alpine
          for i in $(seq 1 30); do
            docker exec stratum-ci-pg pg_isready -U postgres && break
            sleep 1
          done
        '''
      }
    }

    stage('Backend — install & test') {
      steps {
        dir('backend') {
          sh '''
            python -m pip install --upgrade pip
            pip install -r requirements-ci.txt
            export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg2://postgres:postgres@127.0.0.1:5433/jenkins_stratum}"
            export JWT_SECRET_KEY="${JWT_SECRET_KEY:-$(python - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
)}"
            export GROQ_API_KEY="${GROQ_API_KEY:-jenkins-ci-dummy-key}"
            ruff check app/ --select E,W,F,N --ignore E501
            pytest tests/ -v --tb=short --junitxml=test-results.xml
          '''
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'backend/test-results.xml'
        }
      }
    }

    stage('Frontend — build') {
      environment {
        VITE_API_BASE = 'http://localhost:8000/api/v1'
      }
      steps {
        dir('frontend') {
          sh '''
            npm ci
            npm run build
          '''
        }
      }
    }

    stage('Docker — build images') {
      when { branch 'main' }
      steps {
        sh '''
          docker build -t stratum-backend:ci ./backend
          docker build -t stratum-frontend:ci ./frontend
        '''
      }
    }

    stage('Deploy — kubectl (optional)') {
      when { branch 'main' }
      steps {
        echo 'Apply manifests: kubectl apply -k deploy/k8s/overlays/production'
      }
    }
  }

  post {
    always {
      sh 'docker rm -f stratum-ci-pg 2>/dev/null || true'
    }
    failure {
      echo 'Pipeline failed — check junit and console logs.'
    }
  }
}
