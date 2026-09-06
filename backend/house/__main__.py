"""
Command line entry point for the House Engine.

    cd backend
    python -m house house/examples/test_house_001.json
    python -m house house/examples/test_house_001.json --json
    python -m house house/examples/test_house_001.json --why B01

Exit code 1 means the model check found a critical error, so this can be used
as a gate in a script.
"""

from __future__ import annotations

import argparse
import json
import sys

from .interpret import interpret
from .report import describe, explain, to_dict
from .schema import SchemaError, load_model
from .validate import check_model, format_report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m house",
        description="Interpret a structural model and run the model check.")
    parser.add_argument("model", help="path to a structural model JSON file")
    parser.add_argument("--json", action="store_true",
                        help="print the interpretation as JSON")
    parser.add_argument("--why", metavar="ID",
                        help="print every reason recorded for one object")
    args = parser.parse_args(argv)

    try:
        model = load_model(args.model)
    except (SchemaError, OSError) as exc:
        print(f"could not read the model: {exc}", file=sys.stderr)
        return 2

    interp = interpret(model)
    result = check_model(model, interp)

    if args.why:
        lines = explain(interp, args.why)
        if not lines:
            print(f"nothing was derived for {args.why}")
        for line in lines:
            print(f"- {line}")
        return 1 if result.blocks_calculation else 0

    if args.json:
        payload = to_dict(model, interp)
        payload["issues"] = [
            {"severity": i.severity, "code": i.code, "message": i.message,
             "refs": list(i.refs)} for i in result.sorted()
        ]
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 1 if result.blocks_calculation else 0

    print(describe(model, interp))
    print(format_report(result))
    return 1 if result.blocks_calculation else 0


if __name__ == "__main__":
    raise SystemExit(main())
