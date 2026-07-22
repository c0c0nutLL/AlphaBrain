from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from alphabrain_ui.database import Base, Database, EvaluationRun, Job, ModelDeployment


def test_frozen_initial_migration_matches_models_and_downgrades(tmp_path: Path) -> None:
    database = Database(tmp_path / "migration.sqlite3")
    database.migrate()

    inspector = inspect(database.engine)
    business_tables = set(inspector.get_table_names()) - {"alembic_version"}
    assert business_tables == set(Base.metadata.tables)
    assert {item["name"] for item in inspector.get_columns("jobs")} == {column.name for column in Job.__table__.columns}
    job_uniques = {tuple(item["column_names"]) for item in inspector.get_unique_constraints("jobs")}
    assert ("output_dir",) in job_uniques
    assert "ix_jobs_input_checkpoint_path" in {item["name"] for item in inspector.get_indexes("jobs")}
    assert {item["name"] for item in inspector.get_columns("model_deployments")} == {
        column.name for column in ModelDeployment.__table__.columns
    }
    assert {item["name"] for item in inspector.get_columns("evaluation_runs")} == {
        column.name for column in EvaluationRun.__table__.columns
    }

    config = Config()
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alphabrain_ui/migrations"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database.path}")
    command.downgrade(config, "base")
    assert not (set(inspect(database.engine).get_table_names()) - {"alembic_version"})
