vision8-backend
├── src
│   ├── api
│   │   ├── __init__.py
│   │   ├── routes.py
│   │   └── validation.py
│   ├── core
│   │   ├── __init__.py
│   │   ├── config.py
│   │   └── security.py
│   ├── services
│   │   ├── __init__.py
│   │   ├── elastic_service.py
│   │   ├── metadata_generator.py
│   │   └── video_processor.py
│   ├── utils
│   │   ├── __init__.py
│   │   ├── logging.py
│   │   └── helpers.py
│   └── main.py
├── tests
│   ├── __init__.py
│   ├── test_api.py
│   └── test_services.py
├── requirements.txt
├── .env.example
├── .gitignore
├── cloudbuild.yaml
└── README.md