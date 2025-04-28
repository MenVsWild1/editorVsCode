import subprocess
import sys
import tempfile
import os
import ast
import json
from flask import Flask, request, jsonify
from flask_cors import CORS

EXECUTION_TIMEOUT = 5

FORBIDDEN_MODULES = {
    'pygame', 'tkinter', 'kivy', 'turtle',
    'PyQt5', 'PySide2', 'PyQt6', 'PySide6',
    'wx',
    'arcade',
    'pyglet',
    'os', 'subprocess', 'shutil', 'sys',
    '_thread', 'threading', 'multiprocessing',
    'socket', 'requests', 'urllib',
    'ctypes',
}

FILESYSTEM_FILE = 'filesystem.json'

app = Flask(__name__)
CORS(app, resources={r"/execute/python": {"origins": "*"}, r"/filesystem": {"origins": "*"}})

class ImportChecker(ast.NodeVisitor):
    def __init__(self, forbidden_modules):
        super().__init__()
        self.forbidden_modules = forbidden_modules
        self.found_forbidden = None

    def visit_Import(self, node):
        for alias in node.names:
            if alias.name in self.forbidden_modules:
                self.found_forbidden = alias.name
                return
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        if node.module and node.module in self.forbidden_modules:
             self.found_forbidden = node.module
             return
        self.generic_visit(node)

def is_code_safe(code_string):
    try:
        tree = ast.parse(code_string)
        checker = ImportChecker(FORBIDDEN_MODULES)
        checker.visit(tree)
        if checker.found_forbidden:
            return False, f"Обнаружен запрещенный импорт: '{checker.found_forbidden}'"
        return True, ""
    except SyntaxError as e:
        return False, f"Синтаксическая ошибка в коде: {e}"
    except Exception as e:
        return False, f"Ошибка анализа кода: {e}"

@app.route('/filesystem', methods=['GET'])
def load_filesystem():
    if os.path.exists(FILESYSTEM_FILE):
        try:
            with open(FILESYSTEM_FILE, 'r', encoding='utf-8') as f:
                content = f.read()
                if not content.strip():
                     print(f"Warning: {FILESYSTEM_FILE} is empty or whitespace only.", file=sys.stderr)
                     return jsonify([]), 200

                f.seek(0)
                data = json.load(f)
                print(f"Successfully loaded filesystem from {FILESYSTEM_FILE}", file=sys.stderr)
                return jsonify(data), 200
        except json.JSONDecodeError:
            print(f"!!! Error decoding JSON from {FILESYSTEM_FILE} !!! File might be corrupted.", file=sys.stderr)
            return jsonify({"error": "Ошибка чтения данных файловой системы (неверный формат). Файл мог быть поврежден."}), 500
        except Exception as e:
            print(f"Error reading {FILESYSTEM_FILE}: {e}", file=sys.stderr)
            return jsonify({"error": f"Ошибка сервера при чтении данных: {e}"}), 500
    else:
        print(f"{FILESYSTEM_FILE} does not exist. Returning empty filesystem.", file=sys.stderr)
        return jsonify([]), 200

@app.route('/filesystem', methods=['POST'])
def save_filesystem():
    if not request.is_json:
        return jsonify({"error": "Запрос должен быть JSON"}), 400

    data = request.get_json()

    if not isinstance(data, list):
         return jsonify({"error": "Неверный формат данных. Ожидается список."}), 400

    try:
        with open(FILESYSTEM_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        return jsonify({"success": True}), 200
    except Exception as e:
        print(f"Error writing to {FILESYSTEM_FILE}: {e}", file=sys.stderr)
        return jsonify({"error": f"Ошибка сервера при сохранении данных: {e}"}), 500

@app.route('/execute/python', methods=['POST'])
def execute_python():
    if not request.is_json:
        return jsonify({"error": "Запрос должен быть JSON"}), 400

    data = request.get_json()
    code = data.get('code')

    if code is None:
        return jsonify({"error": "Отсутствует 'code' в теле запроса"}), 400
    if not isinstance(code, str):
         return jsonify({"error": "'code' должен быть строкой"}), 400

    safe, message = is_code_safe(code)
    if not safe:
        return jsonify({
            "stdout": "",
            "stderr": f"Ошибка безопасности: {message}. Выполнение прервано."
        }), 200

    stdout_result = ""
    stderr_result = ""
    temp_file_path = None

    try:
        with tempfile.NamedTemporaryFile(mode='w+', delete=False, suffix='.py', encoding='utf-8') as temp_file:
            temp_file.write(code)
            temp_file_path = temp_file.name

        process = subprocess.run(
            [sys.executable, '-u', '-I', temp_file_path],
            capture_output=True,
            text=True,
            timeout=EXECUTION_TIMEOUT,
            encoding='utf-8',
            errors='replace'
        )
        stdout_result = process.stdout
        stderr_result = process.stderr

    except subprocess.TimeoutExpired:
        stderr_result = f"Ошибка: Код выполнялся дольше {EXECUTION_TIMEOUT} секунд и был прерван."
    except Exception as e:
        stderr_result = f"Ошибка выполнения на сервере: {e}"
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except OSError as e:
                print(f"Ошибка удаления временного файла {temp_file_path}: {e}", file=sys.stderr)

    return jsonify({
        "stdout": stdout_result,
        "stderr": stderr_result
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
