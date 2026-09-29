"""Business logic layer.

Services own authorization decisions and business-rule validation; routers
call services and never talk to SQLAlchemy models directly. See
docs/architecture.md section 3.
"""
